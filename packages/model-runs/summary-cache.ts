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
  get(key: string): Promise<{ size: number; text(): Promise<string>; etag?: string } | null>;
  /** R2 put; with `onlyIf` it resolves null when the condition fails (an atomic claim). */
  put(
    key: string,
    value: string,
    options?: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } },
  ): Promise<unknown>;
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
  options: { now?: () => number; budgetMs?: number; rowMs?: number } = {},
) {
  const clock = options.now ?? Date.now;
  const deadline = clock() + (options.budgetMs ?? 45_000);
  /**
   * attempted: reads started; refreshed: snapshots written; failed: attempted but not written
   * (read error, timeout, or the deadline between read and write); remaining: never started.
   */
  const result = { attempted: 0, refreshed: 0, failed: 0, remaining: revisions.length };
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
    result.attempted++;
    result.remaining--;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        read(row.challenge, row.revision),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Model refresh timed out.")),
            Math.max(0, Math.min(deadline - clock(), options.rowMs ?? Infinity)),
          );
        }),
      ]);
      if (clock() >= deadline) throw new Error("Model refresh deadline after read.");
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
  }
  return result;
}

/**
 * Run order for a bounded refresh, with no stored state beyond the snapshots themselves. The first
 * `rotation` items come from a fixed hourly rotation over the key-sorted list, regardless of past
 * success or failure, so a frontier of revisions that keep failing or stalling can never starve the
 * rest: each item is a rotation pick once every ceil(n / rotation) hours and is attempted first in
 * that run. The rest follow stalest first (never written, then oldest, then by key) when the
 * snapshot listing is available, else in rotation order.
 */
export function fairOrder<T>(
  items: readonly T[],
  key: (item: T) => string,
  refreshedAt: ReadonlyMap<string, number> | null,
  hour: number,
  rotation: number,
  /** Without a listing, the rest start this many places further each hour (a run's width). */
  stride = rotation,
): T[] {
  const sorted = [...items].sort((a, b) => key(a).localeCompare(key(b)));
  const n = sorted.length;
  if (!n) return [];
  const start = (((hour * rotation) % n) + n) % n;
  const cyclic = [...sorted.slice(start), ...sorted.slice(0, start)];
  const picks = cyclic.slice(0, Math.min(rotation, n));
  const rest = cyclic.slice(picks.length);
  if (refreshedAt) {
    const at = (item: T) => refreshedAt.get(key(item)) ?? -Infinity;
    rest.sort((a, b) => at(a) - at(b) || key(a).localeCompare(key(b)));
  } else {
    // Continue a whole run's width further along the sorted list each hour.
    const index = new Map(sorted.map((item, i) => [item, i]));
    const from = (((hour * stride) % n) + n) % n;
    const offset = (item: T) => (index.get(item)! - from + n) % n;
    rest.sort((a, b) => offset(a) - offset(b));
  }
  return [...picks, ...rest];
}
