import type { Sql } from "./ledger";
import { HARNESS_VERSION } from "./tools";
import {
  modelReceipt,
  validReceiptSlot,
  RECEIPT_BYTES,
  type ReceiptSlot,
  type ModelReceipt,
} from "./receipts";
export interface ReceiptRead {
  state: "ready" | "unconfigured" | "unavailable";
  receipts: ModelReceipt[];
  truncated: boolean;
  readAt: string;
}
export interface ReceiptBucket {
  get(
    key: string,
  ): Promise<{ size: number; body: ReadableStream<Uint8Array> } | null>;
}
async function beforeDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  cancel?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            reject(new Error("Receipt query budget exceeded."));
            cancel?.();
          },
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function boundedText(
  object: {
    size: number;
    body: ReadableStream<Uint8Array>;
  },
  deadline: number,
) {
  if (object.size > RECEIPT_BYTES) {
    await object.body.cancel();
    throw new Error("Receipt exceeds read budget.");
  }
  const reader = object.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await beforeDeadline(
        reader.read(),
        deadline,
        () => {
          void reader.cancel().catch(() => {});
        },
      );
      if (done) break;
      size += value.byteLength;
      if (size > RECEIPT_BYTES) throw new Error();
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
/** Fixed read-only query and fixed private R2 prefixes. No reasons/errors/code escape. */
export async function readModelReceipts(
  db: Sql,
  bucket: ReceiptBucket,
  key: string,
  revision: string,
  budgetMs = 15000,
): Promise<ReceiptRead> {
  const deadline = Date.now() + budgetMs;
  const rows = await beforeDeadline(
    db.all<ReceiptSlot>(
      `SELECT model, harness_version, condition, try, status, outcome, run_id, submissions FROM model_runs WHERE challenge_key = ? AND revision = ? AND harness_version = ? ORDER BY model, condition, try LIMIT 26`,
      [key, revision, HARNESS_VERSION],
    ),
    deadline,
  );
  const receipts: ModelReceipt[] = [];
  for (const row of rows.slice(0, 25)) {
    if (!validReceiptSlot(row)) continue;
    if (row.status !== "finished") {
      receipts.push(modelReceipt(row, null, key, revision));
      continue;
    }
    if (Date.now() > deadline)
      throw new Error("Receipt read exceeded its query budget.");
    const get = async (path: string) => {
      const pending = bucket.get(path).then((object) => {
        if (object && Date.now() > deadline) {
          void object.body.cancel().catch(() => {});
          return null;
        }
        return object;
      });
      return beforeDeadline(pending, deadline);
    };
    const object =
      (await get(`model-runs/stored/${row.run_id}.ndjson`)) ??
      (await get(`model-runs/outbox/${row.run_id}.ndjson`));
    let text: string | null = null;
    try {
      if (object) text = await boundedText(object, deadline);
    } catch {
      receipts.push({
        ...modelReceipt(row, null, key, revision),
        state: "receipt-unavailable",
      });
      continue;
    }
    receipts.push(modelReceipt(row, text, key, revision));
  }
  return {
    state: "ready",
    receipts,
    truncated: rows.length > 25,
    readAt: new Date().toISOString(),
  };
}
