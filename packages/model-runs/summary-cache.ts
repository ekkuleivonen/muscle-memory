/** Private, code-free model metadata snapshots. No human records or model execution. */
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import type { ReceiptRead } from "./read-receipts";
import { HARNESS_VERSION } from "./tools";

export const MODEL_SUMMARY_VERSION = "model-summary-1";
export const SUMMARY_MAX_AGE = 2 * 60 * 60 * 1000;
export const SUMMARY_BYTES = 128 * 1024;
export async function withinSummaryBudget<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Summary storage deadline exceeded.")),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export interface SummaryBucket {
  get(key: string): Promise<{ size: number; text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<unknown>;
  /** R2's listing; the human refresh reads only its own snapshot prefix's keys and upload times. */
  list?(options: { prefix: string; limit: number }): Promise<{
    objects: { key: string; uploaded: Date }[];
    truncated: boolean;
  }>;
}
export interface ModelSummary {
  version: typeof MODEL_SUMMARY_VERSION;
  harness: typeof HARNESS_VERSION;
  challenge: string;
  revision: string;
  refreshedAt: number;
  /** The existing allowlisted reader produces these, never raw stored run text. */
  result: ReceiptRead;
}
export const MODEL_SUMMARY_PREFIX = `comparison-summaries/models/${MODEL_SUMMARY_VERSION}/${encodeURIComponent(HARNESS_VERSION)}/`;
export function summaryKey(challenge: string, revision: string) {
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("An exact registered challenge revision is required.");
  return `${MODEL_SUMMARY_PREFIX}${challenge}/${revision}.json`;
}
/** Explicit projection also drops accidental future private fields in the source reader. */
function publicResult(value: ReceiptRead): ReceiptRead {
  if (
    value.state !== "ready" ||
    value.truncated ||
    value.receipts.length > 25 ||
    value.receipts.some((r) => r.state === "receipt-unavailable")
  )
    throw new Error("An incomplete model read cannot refresh the snapshot.");
  return {
    state: "ready",
    truncated: false,
    readAt: value.readAt,
    receipts: value.receipts.map((r) => ({
      model: r.model,
      reportedModels: r.reportedModels,
      reasoning: r.reasoning,
      defaultReasoning: r.defaultReasoning,
      finalCodeLength: r.finalCodeLength,
      harness: r.harness,
      try: r.try,
      state: r.state,
      submissions: r.submissions,
      runtime: r.runtime,
      features: r.features,
      budget: r.budget
        ? { turns: r.budget.turns, submissions: r.budget.submissions }
        : null,
    })),
  };
}
export async function writeModelSummary(
  bucket: SummaryBucket,
  challenge: string,
  revision: string,
  result: ReceiptRead,
  now = Date.now(),
  budgetMs = 5000,
) {
  const key = summaryKey(challenge, revision);
  const snapshot: ModelSummary = {
    version: MODEL_SUMMARY_VERSION,
    harness: HARNESS_VERSION,
    challenge,
    revision,
    refreshedAt: now,
    result: publicResult(result),
  };
  const text = JSON.stringify(snapshot);
  if (new TextEncoder().encode(text).length > SUMMARY_BYTES)
    throw new Error("Model summary exceeds its size budget.");
  await withinSummaryBudget(
    bucket.put(key, text),
    Math.min(5000, Math.max(0, budgetMs)),
  );
}
/** Reads never invoke a raw query or receipt scan, including cold/expired/error paths. */
export async function readModelSummary(
  bucket: SummaryBucket,
  challenge: string,
  revision: string,
  now = Date.now(),
): Promise<ReceiptRead | null> {
  const key = summaryKey(challenge, revision);
  const deadline = Date.now() + 5000;
  try {
    const object = await withinSummaryBudget(
      bucket.get(key),
      Math.max(0, deadline - Date.now()),
    );
    if (!object || object.size > SUMMARY_BYTES) return null;
    const text = await withinSummaryBudget(
      object.text(),
      Math.max(0, deadline - Date.now()),
    );
    if (new TextEncoder().encode(text).length > SUMMARY_BYTES) return null;
    const value = JSON.parse(text) as ModelSummary;
    if (
      value.version !== MODEL_SUMMARY_VERSION ||
      value.harness !== HARNESS_VERSION ||
      value.challenge !== challenge ||
      value.revision !== revision ||
      !Number.isSafeInteger(value.refreshedAt) ||
      value.refreshedAt > now ||
      now - value.refreshedAt >= SUMMARY_MAX_AGE
    )
      return null;
    return publicResult(value.result);
  } catch {
    return null;
  }
}

/** Sequential bounded refresh; a failed revision never erases a previous good snapshot. */
export async function refreshModelSummaries(
  revisions: readonly { challenge: string; revision: string }[],
  bucket: SummaryBucket,
  read: (challenge: string, revision: string) => Promise<ReceiptRead>,
  options: { now?: () => number; budgetMs?: number } = {},
) {
  const clock = options.now ?? Date.now;
  const deadline = clock() + (options.budgetMs ?? 45_000);
  const result = { refreshed: 0, failed: 0, remaining: revisions.length };
  if (
    revisions.length > 100 ||
    new Set(revisions.map((r) => summaryKey(r.challenge, r.revision))).size !==
      revisions.length
  )
    throw new Error(
      "The current catalog exceeds the refresh bound or contains duplicate revisions.",
    );
  for (const row of revisions) {
    if (clock() >= deadline) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        read(row.challenge, row.revision),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Model refresh timed out.")),
            Math.max(0, deadline - clock()),
          );
        }),
      ]);
      if (clock() >= deadline) break;
      await writeModelSummary(
        bucket,
        row.challenge,
        row.revision,
        value,
        clock(),
        deadline - clock(),
      );
      result.refreshed++;
    } catch {
      result.failed++;
    } finally {
      if (timer) clearTimeout(timer);
    }
    result.remaining--;
  }
  return result;
}
