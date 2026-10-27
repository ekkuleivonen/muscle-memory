import type { UploadedHistory } from "../../../packages/developer-profile/uploaded-history";

export const HISTORY_READ_INTERVAL_MS = 61_000;
export const HISTORY_MAX_PAGES = 20;
export const HISTORY_MAX_ATTEMPTS = 100;

/** Merge exact attempt revisions; later-page failures must never erase earlier evidence. */
export function mergeHistoryPage(
  previous: UploadedHistory | null,
  page: UploadedHistory,
) {
  if (
    !Array.isArray(page.attempts) ||
    !Array.isArray(page.unavailable) ||
    (page.next !== null && typeof page.next !== "string")
  )
    throw new Error("Invalid history page.");
  const attempts = [
    ...new Map(
      [...(previous?.attempts ?? []), ...page.attempts].map((a) => [
        `${a.attempt}:${a.revision}`,
        a,
      ]),
    ).values(),
  ];
  const available = new Set(attempts.map((a) => a.attempt));
  const unavailable = [
    ...new Map(
      [...(previous?.unavailable ?? []), ...page.unavailable]
        .filter((a) => !available.has(a.attempt))
        .map((a) => [a.attempt, a]),
    ).values(),
  ];
  const stalled = Boolean(
    previous?.next && page.next && page.next <= previous.next,
  );
  const capped = attempts.length + unavailable.length >= HISTORY_MAX_ATTEMPTS;
  return {
    value: {
      ...page,
      readAt: previous?.readAt ?? page.readAt,
      attempts: attempts.slice(0, HISTORY_MAX_ATTEMPTS),
      unavailable: unavailable.slice(
        0,
        Math.max(0, HISTORY_MAX_ATTEMPTS - attempts.length),
      ),
      next: stalled || capped ? null : page.next,
    },
    notice: stalled
      ? "Some earlier practice could not be added."
      : capped && page.next
        ? "Showing up to 100 uploaded attempts."
        : undefined,
  };
}

/** Automatic retries after a failed history read, each at the server's read interval. */
export const HISTORY_AUTO_RETRIES = 2;
/**
 * A fixed, non-sensitive code for a failed read: the HTTP status and the server's fixed
 * diagnostic stage, or where the browser failed. Never the request body, identity or response text.
 */
export type HistoryFailure =
  | `http-${number}`
  | `http-${number}:${string}`
  | "timeout"
  | "network"
  | "identity"
  | "invalid-page";
const DIAGNOSTIC = /^[a-z0-9-]{1,40}$/;
export function failureReason(status: number, diagnostic: unknown): HistoryFailure {
  return typeof diagnostic === "string" && DIAGNOSTIC.test(diagnostic)
    ? `http-${status}:${diagnostic}`
    : `http-${status}`;
}
/**
 * Whether a failed read may be tried again. Rate limits, server and storage failures, timeouts,
 * network errors and a slow identity read can pass; ownership refusals and bad requests won't.
 */
export function retryable(reason: HistoryFailure): boolean {
  if (reason === "invalid-page") return false;
  const m = /^http-(\d+)/.exec(reason);
  if (!m) return true;
  const status = Number(m[1]);
  return status === 429 || status >= 500;
}
