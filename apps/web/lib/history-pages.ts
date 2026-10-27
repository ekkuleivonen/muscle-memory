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
