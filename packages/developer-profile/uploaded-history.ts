/** Fixed owner-only current-snapshot reader. No persistent cache or raw response. */
import { safeIdentifier } from "../domain/capture";
import { CHALLENGE_KEY, REVISION, type StoredRecord } from "../domain/records";
import { AFTER_QUESTIONS } from "../domain/practice";
import { deriveAttempts, type AttemptSummary } from "./derive";
import { METRICS, type Values } from "./registry";

export const HISTORY_PAGE_SIZE = 100;
export const HISTORY_BATCH_BYTES = 6 * 1024 * 1024;
export const HISTORY_BATCH_RECORDS = 25_000;
export const HISTORY_REPLY_BYTES = 256 * 1024;
export const HISTORY_TRANSPORT_BYTES = 16 * 1024 * 1024;
export const HISTORY_MAX_RECORDS = 10000;
export const HISTORY_MAX_BYTES = 4 * 1024 * 1024;
export interface HistoryWindow {
  from: string;
  to: string;
  after: string;
}
export interface UploadedHistory {
  attempts: AttemptSummary[];
  unavailable: { attempt: string; last: string; reason: string }[];
  next: string | null;
  readAt: string;
  window: HistoryWindow;
  state: "ready" | "absent";
}
export function historyWindow(input: unknown): HistoryWindow {
  const v = input as HistoryWindow;
  const validDate = (s: unknown): s is string =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    !v ||
    !validDate(v.from) ||
    !validDate(v.to) ||
    Date.parse(v.to) < Date.parse(v.from) ||
    Date.parse(v.to) - Date.parse(v.from) >= 366 * 86400000
  )
    throw new Error("Choose 1–366 valid UTC days.");
  if (typeof v.after !== "string") throw new Error("Invalid history page.");
  if (v.after) safeIdentifier(v.after);
  return { from: v.from, to: v.to, after: v.after };
}
/** Window discovers attempts with activity; selected attempts are read in full, across resumes.
 * Join the unique conflict IDs: DataFusion cannot physically plan IN subqueries inside this aggregate CASE.
 */
export function historyQuery(
  participant: string,
  input: HistoryWindow,
): string {
  safeIdentifier(participant);
  const w = historyWindow(input);
  const end = new Date(Date.parse(w.to) + 86400000).toISOString().slice(0, 10);
  return `WITH owner AS (
 SELECT record_id, payload, attempt_id, occurred_at FROM default.events
 WHERE participant_id = '${participant}' AND kind = 'observation'
 AND type LIKE 'practice.%' AND attempt_id IS NOT NULL
), conflicts AS (
 SELECT record_id FROM owner GROUP BY record_id HAVING COUNT(DISTINCT payload) > 1
), selected AS (
 SELECT o.attempt_id, COUNT(*) AS observations, SUM(octet_length(o.payload)) AS bytes,
 MIN(o.occurred_at) AS first_at, MAX(o.occurred_at) AS last_at,
 SUM(CASE WHEN c.record_id IS NOT NULL THEN 1 ELSE 0 END) AS conflicts
 FROM owner o LEFT JOIN conflicts c ON c.record_id = o.record_id
 GROUP BY o.attempt_id
 HAVING MAX(CASE WHEN o.occurred_at >= '${w.from}T00:00:00.000Z' AND o.occurred_at < '${end}T00:00:00.000Z' THEN 1 ELSE 0 END) = 1
 AND o.attempt_id > '${w.after}'
 ORDER BY o.attempt_id LIMIT ${HISTORY_PAGE_SIZE + 1}
), costs AS (
 SELECT *, CASE WHEN observations <= ${HISTORY_MAX_RECORDS} AND bytes <= ${HISTORY_MAX_BYTES} THEN bytes ELSE 0 END AS read_bytes,
 CASE WHEN observations <= ${HISTORY_MAX_RECORDS} AND bytes <= ${HISTORY_MAX_BYTES} THEN observations ELSE 0 END AS read_records
 FROM selected
), bounded AS (
 SELECT *, ROW_NUMBER() OVER (ORDER BY attempt_id) AS position,
 SUM(read_bytes) OVER (ORDER BY attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS batch_bytes,
 SUM(read_records) OVER (ORDER BY attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS batch_records FROM costs
), marked AS (
 SELECT *, CASE WHEN position <= ${HISTORY_PAGE_SIZE} AND batch_bytes <= ${HISTORY_BATCH_BYTES} AND batch_records <= ${HISTORY_BATCH_RECORDS} THEN 1 ELSE 0 END AS readable FROM bounded
), frontier AS (
 SELECT *, LAG(readable,1,1) OVER (ORDER BY position) AS previous_readable FROM marked
)
SELECT CASE WHEN b.readable=1 THEN 'entry' ELSE 'continuation' END AS scope,
 b.attempt_id,b.observations,b.bytes,b.first_at,b.last_at,b.conflicts,o.record_id,o.payload
FROM frontier b LEFT JOIN owner o ON o.attempt_id=b.attempt_id AND b.readable=1
 AND b.observations <= ${HISTORY_MAX_RECORDS} AND b.bytes <= ${HISTORY_MAX_BYTES}
WHERE b.readable=1 OR b.previous_readable=1`;
}

type Row = {
  scope: string;
  conflicts: number;
  attempt_id: string;
  observations: number;
  bytes: number;
  first_at: string;
  last_at: string;
  record_id: string;
  payload: string;
};
/** A single SELECT avoids Basin's distributed UNION partition failure under some input partitionings.
 * Repeated metadata is checked before it is reduced to the existing private interpreter shape. */
export function normalizeHistoryRows(rows: unknown): unknown {
  if (
    !Array.isArray(rows) ||
    rows.length > HISTORY_BATCH_RECORDS + HISTORY_PAGE_SIZE + 1
  )
    throw new Error("History response exceeds its budget.");
  const entries = new Map<string, Row>();
  const normalized: Row[] = [];
  const meta = [
    "observations",
    "bytes",
    "first_at",
    "last_at",
    "conflicts",
  ] as const;
  for (const row of rows as Row[]) {
    if (!row || typeof row !== "object")
      throw new Error("Invalid history response.");
    if (row.scope !== "entry") {
      normalized.push(row);
      continue;
    }
    const previous = entries.get(row.attempt_id);
    if (previous && meta.some((k) => previous[k] !== row[k]))
      throw new Error("Invalid attempt coverage.");
    if (!previous) {
      const entry = {
        ...row,
        scope: "attempt",
        record_id: null,
        payload: null,
      } as unknown as Row;
      entries.set(row.attempt_id, entry);
      normalized.push(entry);
    }
    if (row.record_id === null && row.payload === null) continue;
    if (typeof row.record_id !== "string" || typeof row.payload !== "string")
      throw new Error("Invalid observation.");
    normalized.push({ ...row, scope: "observation" });
  }
  return normalized;
}

/** Never forward arbitrary event strings: only defined reflection choices and typed checkpoints. */
function project(a: AttemptSummary): AttemptSummary {
  const answers = Object.fromEntries(
    Object.entries(a.answers).filter(
      ([k, v]) =>
        Object.hasOwn(AFTER_QUESTIONS, k) &&
        (
          AFTER_QUESTIONS[
            k as keyof typeof AFTER_QUESTIONS
          ] as readonly string[]
        ).includes(v),
    ),
  );
  const runtimeKeys = [
    "id",
    "version",
    "engine",
    "python",
    "transpiler",
    "postgres",
    "php",
    "ruby",
    "go",
    "clang",
    "dotnet",
    "java",
  ];
  const conditions = a.conditions
    .filter((c) => {
      if (c.startsWith("Editor: "))
        return /^Editor: (CodeMirror|codemirror-6); features: [a-z0-9,+ -]{0,600}$/.test(
          c,
        );
      if (!c.startsWith("Runtime: ")) return false;
      try {
        const r = JSON.parse(c.slice(9));
        return (
          r &&
          !Array.isArray(r) &&
          Object.keys(r).length > 0 &&
          Object.keys(r).every((k) => runtimeKeys.includes(k)) &&
          Object.values(r).every(
            (v) =>
              typeof v === "string" &&
              v.length <= 128 &&
              /^[a-zA-Z0-9 ._+():/-]+$/.test(v),
          )
        );
      } catch {
        return false;
      }
    })
    .slice(0, 20);
  const timeline = a.timeline.filter((t) =>
    /^(started|opened|completed|closed|capture-gap|Code checkpoint \((opened|periodic|run|oversize-edit|restored)\)|(examples|submit): (result|user-error|runner-error|timeout|cancelled)|(?:passed|failed|errored|cancelled): \d+\/\d+ checks; \d+ static rules)$/.test(
      t.label,
    ),
  );
  return { ...a, answers, conditions, timeline, issues: a.issues.slice(0, 20) };
}
export function historyResult(
  participant: string,
  input: HistoryWindow,
  rows: unknown,
  readAt = new Date().toISOString(),
): UploadedHistory {
  safeIdentifier(participant);
  const window = historyWindow(input);
  if (
    !Array.isArray(rows) ||
    rows.length > HISTORY_BATCH_RECORDS + HISTORY_PAGE_SIZE + 1
  )
    throw new Error("History response exceeds its budget.");
  const rs = rows as Row[];
  if (
    rs.some(
      (r) =>
        !r || !["attempt", "observation", "continuation"].includes(r.scope),
    )
  )
    throw new Error("Invalid history response.");
  const entries = rs
    .filter((r) => r.scope === "attempt")
    .sort((a, b) =>
      a.attempt_id < b.attempt_id ? -1 : a.attempt_id > b.attempt_id ? 1 : 0,
    );
  if (
    entries.length > HISTORY_PAGE_SIZE ||
    new Set(entries.map((e) => e.attempt_id)).size !== entries.length
  )
    throw new Error("Invalid history page.");
  for (const e of entries) {
    safeIdentifier(e.attempt_id);
    if (
      e.attempt_id <= window.after ||
      !Number.isSafeInteger(Number(e.observations)) ||
      Number(e.observations) < 1 ||
      !Number.isSafeInteger(Number(e.bytes)) ||
      Number(e.bytes) < 1 ||
      !Number.isSafeInteger(Number(e.conflicts)) ||
      Number(e.conflicts) < 0 ||
      !Number.isFinite(Date.parse(e.first_at)) ||
      !Number.isFinite(Date.parse(e.last_at))
    )
      throw new Error("Invalid attempt coverage.");
  }
  const continuation = rs.filter((r) => r.scope === "continuation");
  if (continuation.length > 1 || (continuation.length && !entries.length))
    throw new Error("Invalid history page.");
  if (continuation.length) {
    safeIdentifier(continuation[0].attempt_id);
    if (continuation[0].attempt_id <= entries.at(-1)!.attempt_id)
      throw new Error("Invalid history page.");
  }
  const page = entries;
  const attempts: AttemptSummary[] = [];
  const unavailable: UploadedHistory["unavailable"] = [];
  const byAttempt = new Map<string, Row[]>();
  const selectedIds = new Set(entries.map((e) => e.attempt_id));
  let inputBytes = 0,
    visited = 0;
  for (const r of rs)
    if (r.scope === "observation") {
      if (!selectedIds.has(r.attempt_id) || typeof r.payload !== "string")
        throw new Error("Invalid history response.");
      inputBytes += new TextEncoder().encode(r.payload).length;
      if (inputBytes > HISTORY_BATCH_BYTES)
        throw new Error("History input exceeds its budget.");
      const group = byAttempt.get(r.attempt_id) ?? [];
      group.push(r);
      byAttempt.set(r.attempt_id, group);
    }
  const append = (
    added: AttemptSummary[],
    missing: UploadedHistory["unavailable"],
  ) => {
    const candidate = {
      state: "ready",
      attempts: [...attempts, ...added],
      unavailable: [...unavailable, ...missing],
      next: page[visited]?.attempt_id ?? null,
      readAt,
      window,
    };
    if (
      new TextEncoder().encode(JSON.stringify(candidate)).length >
      HISTORY_REPLY_BYTES
    ) {
      if (visited) return false;
      missing = [
        {
          attempt: page[0].attempt_id,
          last: page[0].last_at,
          reason:
            "Attempt summary exceeds the private reader’s response budget.",
        },
      ];
      added = [];
    }
    attempts.push(...added);
    unavailable.push(...missing);
    visited++;
    return true;
  };
  for (const e of page) {
    const observations = byAttempt.get(e.attempt_id) ?? [];
    const budget =
      Number(e.observations) > HISTORY_MAX_RECORDS ||
      Number(e.bytes) > HISTORY_MAX_BYTES;
    if (budget) {
      // Missing completion is not "unfinished": do not invent an AttemptSummary.
      if (
        !append(
          [],
          [
            {
              attempt: e.attempt_id,
              last: e.last_at,
              reason:
                "Attempt exceeds the private reader’s 10,000-observation / 4 MiB budget. Challenge, revision, completion and derived values are unavailable.",
            },
          ],
        )
      )
        break;
      continue;
    }
    if (observations.length !== Number(e.observations))
      throw new Error("Incomplete history response.");
    const records: StoredRecord[] = observations.map((r) => {
      safeIdentifier(r.record_id);
      if (typeof r.payload !== "string")
        throw new Error("Invalid observation.");
      const o = JSON.parse(r.payload);
      if (
        o.participantId !== participant ||
        o.attemptId !== e.attempt_id ||
        o.observationId !== r.record_id ||
        o.actor !== "person" ||
        !CHALLENGE_KEY.test(o.challenge ?? "") ||
        !REVISION.test(o.challengeRevision ?? "")
      )
        throw new Error("History identity mismatch.");
      return {
        recordId: r.record_id,
        participantId: participant,
        kind: "observation",
        payload: r.payload,
      };
    });
    if (
      records.reduce(
        (n, r) => n + new TextEncoder().encode(r.payload).length,
        0,
      ) > HISTORY_MAX_BYTES
    )
      throw new Error("History input exceeds its budget.");
    const summaries = deriveAttempts(records, participant).map(project);
    if (Number(e.conflicts) > 0)
      for (const a of summaries) {
        a.issues.push(
          "Conflicting record IDs exist in this attempt’s uploaded evidence; all derived values are unavailable.",
        );
        a.values = Object.fromEntries(
          Object.keys(METRICS).map((k) => [k, null]),
        ) as Values;
      }
    if (!append(summaries, [])) break;
  }
  const result: UploadedHistory = {
    state: "ready",
    attempts,
    unavailable,
    next:
      visited < page.length || continuation.length
        ? page[visited - 1]!.attempt_id
        : null,
    readAt,
    window,
  };
  if (
    new TextEncoder().encode(JSON.stringify(result)).length >
    HISTORY_REPLY_BYTES
  )
    throw new Error("History summaries exceed their response budget.");
  return result;
}

export interface OwnerVerifier {
  verify(
    participant: string,
    secret: string,
  ): Promise<"owned" | "absent" | "deleted" | "denied">;
}
export class HistoryRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Fixed operational category only: never an upstream message, query or record. */
    readonly diagnostic?: string,
  ) {
    super(message);
  }
}
/** Authorization is independently fresh before query and before returning. No cached proofs. */
export async function ownerHistory(
  owner: OwnerVerifier,
  load: (
    participant: string,
    window: HistoryWindow,
  ) => Promise<UploadedHistory>,
  participant: string,
  secret: string,
  window: HistoryWindow,
): Promise<UploadedHistory> {
  safeIdentifier(participant);
  historyWindow(window);
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256)
    throw new HistoryRefusal(401, "Device ownership could not be verified.");
  const verify = async () => {
    const state = await owner.verify(participant, secret);
    if (state === "deleted")
      throw new HistoryRefusal(410, "Uploaded history was deleted.");
    if (state !== "owned" && state !== "absent")
      throw new HistoryRefusal(401, "Device ownership could not be verified.");
    return state;
  };
  if ((await verify()) === "absent")
    return {
      state: "absent",
      attempts: [],
      unavailable: [],
      next: null,
      readAt: new Date().toISOString(),
      window,
    };
  try {
    return await load(participant, window);
  } finally {
    // Deletion wins over a simultaneous transient SQL failure too.
    if ((await verify()) !== "owned")
      throw new HistoryRefusal(401, "Device ownership could not be verified.");
  }
}

export async function readUploadedHistory(
  token: string,
  participant: string,
  window: HistoryWindow,
  request: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<UploadedHistory> {
  if (!token.trim()) throw new Error("History is not configured.");
  const controller = new AbortController();
  let stage = "request";
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const stopped = new Promise<never>((_, reject) =>
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("History timed out.")),
      { once: true },
    ),
  );
  try {
    const response = await Promise.race([
      stopped,
      request(
        "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: historyQuery(participant, window) }),
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
        },
      ),
    ]);
    if (!response.ok) {
      stage = `storage-http-${response.status}`;
      throw new Error("History is unavailable.");
    }
    stage = "response-body";
    const reader = response.body?.getReader();
    if (!reader) throw new Error("History is unavailable.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    // Race stream reads too: an upstream mock/socket need not honor fetch cancellation.
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), stopped]);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > HISTORY_TRANSPORT_BYTES) {
          stage = "response-size";
          throw new Error("History response is too large.");
        }
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    }
    const all = new Uint8Array(bytes);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    stage = "response-json";
    const body = JSON.parse(new TextDecoder().decode(all));
    stage = "storage-result";
    if (body?.success !== true) throw new Error("History is unavailable.");
    stage = "projection";
    return historyResult(
      participant,
      window,
      normalizeHistoryRows(body.result?.rows),
    );
  } catch (cause) {
    // Only messages authored by our validator can refine the category. Nothing
    // from an upstream response or private record is logged or returned.
    const known = new Map([
      ["Invalid history response.", "row-shape"],
      ["Invalid history page.", "page-shape"],
      ["Invalid attempt coverage.", "coverage"],
      ["Incomplete history response.", "incomplete"],
      ["Invalid observation.", "observation-shape"],
      ["History identity mismatch.", "identity"],
      ["History input exceeds its budget.", "input-budget"],
      ["History summaries exceed their response budget.", "summary-budget"],
      ["History response exceeds its budget.", "row-budget"],
    ]);
    const category = controller.signal.aborted
      ? "timeout"
      : stage === "projection" && cause instanceof Error
        ? (known.get(cause.message) ?? stage)
        : stage;
    throw new HistoryRefusal(
      503,
      "Uploaded history could not be read. Your device evidence is still available.",
      category,
    );
  } finally {
    clearTimeout(timer);
  }
}
