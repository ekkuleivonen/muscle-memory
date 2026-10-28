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

/**
 * One read per interval and one retry budget for the whole tab, kept outside any report mount, so
 * remounting /stats can't add reads or refill the budget. Only a successful page refills it.
 */
export class HistoryPacer {
  private next = 0;
  private retriesUsed = 0;
  constructor(private readonly interval = HISTORY_READ_INTERVAL_MS) {}
  /** When the next read may start: now, or the end of the current interval. */
  readyAt(now: number) {
    return Math.max(now, this.next);
  }
  /** Record that a read is starting; returns false (and starts nothing) inside the interval. */
  begin(now: number) {
    if (now < this.next) return false;
    this.next = now + this.interval;
    return true;
  }
  /** After a failed read: when to retry automatically, or undefined once the budget is spent. */
  retryAt(reason: HistoryFailure, now: number, identityDelay = 10_000) {
    if (!retryable(reason) || this.retriesUsed >= HISTORY_AUTO_RETRIES) return undefined;
    this.retriesUsed++;
    // No read was made for an identity failure, so the interval doesn't apply to it.
    return reason === "identity" ? now + identityDelay : this.readyAt(now);
  }
  succeeded() {
    this.retriesUsed = 0;
  }
}

/** A page body that couldn't be parsed or validated. Transport failures are thrown as they are. */
export class MalformedPage extends Error {}
/**
 * Reads a history reply body. Truncated or slow bodies reject with the fetch's own error (abort,
 * timeout or network), so the caller still treats them as transient; only bytes that arrived
 * completely but aren't a JSON object are MalformedPage.
 */
export async function readPageBody(response: Response): Promise<UploadedHistory> {
  const text = await response.text();
  let page: unknown;
  try {
    page = JSON.parse(text);
  } catch {
    throw new MalformedPage("History page isn't JSON.");
  }
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new MalformedPage("History page isn't an object.");
  return page as UploadedHistory;
}
/** The fixed reason for an exception from a history read: a stream or fetch failure, or a malformed page. */
export function thrownReason(error: unknown): HistoryFailure {
  if (error instanceof MalformedPage) return "invalid-page";
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  return "network";
}

/**
 * Merges a page and only then counts it as a success: a reply that parses but fails validation
 * throws before the retry budget is refilled, so only a genuine page restores automatic retries.
 */
export function acceptPage(pacer: HistoryPacer, previous: UploadedHistory | null, page: UploadedHistory) {
  const merged = mergeHistoryPage(previous, page);
  pacer.succeeded();
  return merged;
}
