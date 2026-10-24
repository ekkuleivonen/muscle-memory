/**
 * Records tracker activity (page views, the page's visibility, board moves, replies to review
 * comments, profile answers) on this device for accounts that accepted the current Terms, stamped
 * with that version. Nothing is uploaded yet. One source
 * stream per page load; positions are assigned in call order and writes retry with the same
 * IDs, so retried records deduplicate.
 */
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../../packages/browser/practice-store";
import { randomId } from "../../../../../packages/browser/random-id";
import {
  boardArrival,
  boardMove,
  boardShare,
  boardPage,
  boardProfile,
  boardRecord,
  boardReply,
  boardView,
  type BoardBase,
  type BoardArrivalData,
  type BoardMoveData,
  type BoardShareData,
  type BoardObservation,
  type BoardPageData,
  type BoardProfileData,
  type BoardViewData,
} from "../../../../../packages/domain/board";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { readProfile } from "../../../lib/account";
import { acceptsCurrent } from "../../../lib/legal";

const sourceId = `board-${randomId()}`;
let sequence = 0;
let store: Promise<PracticeStore> | null = null;
const pending: WorkspaceRecord[] = [];

/** The app page before the current one in this tab, for the IDE's `entry` (client navigation leaves document.referrer stale). */
export const PREVIOUS_PATH_KEY = "muscle-memory.previous-path";

export function logBoardMove(
  issue: { id: string; revision: string },
  data: BoardMoveData,
): Promise<void> {
  return log((base) => boardMove({ ...base, issue, data }), "Board move");
}

/** A reply to a review comment; resolves the thread if it was blocking. */
export function logReply(
  issue: { id: string; revision: string },
  data: { issueKey: string; pullRequest: number; comment: string; text: string },
): Promise<void> {
  return log((base) => boardReply({ ...base, issue, data }), "Reply");
}

/** Where an arrival is remembered until the Terms are accepted and it can be recorded. */
const ARRIVAL_KEY = "muscle-memory.arrival";

/**
 * Remembers the first landing page and any referral code, before anything may be recorded.
 * Only the first landing counts; a later shared link does not overwrite it.
 */
export function noteArrival(
  ref: string | null,
  landing = location.pathname + location.search,
): void {
  try {
    if (localStorage.getItem(ARRIVAL_KEY)) return;
    const arrival = {
      ref: ref && /^[a-z0-9]{6,32}$/.test(ref) ? ref : null,
      landing,
      landedAt: new Date().toISOString(),
      recorded: false,
    };
    localStorage.setItem(ARRIVAL_KEY, JSON.stringify(arrival));
  } catch {
    // Storage can be unavailable; the arrival then goes unrecorded.
  }
}

/** Records the remembered arrival once the Terms are accepted; once only. */
export async function logArrival(): Promise<void> {
  let arrival: (BoardArrivalData & { recorded: boolean }) | null = null;
  try {
    arrival = JSON.parse(localStorage.getItem(ARRIVAL_KEY) ?? "null");
  } catch {
    return;
  }
  if (!arrival || arrival.recorded) return;
  const { ref, landing, landedAt } = arrival;
  localStorage.setItem(ARRIVAL_KEY, JSON.stringify({ ...arrival, recorded: true }));
  await log((base) => boardArrival({ ...base, data: { ref, landing, landedAt } }), "Arrival");
}

export function logShare(
  issue: { id: string; revision: string },
  data: BoardShareData,
): Promise<void> {
  return log((base) => boardShare({ ...base, issue, data }), "Share");
}

export function logView(
  issue: { id: string; revision: string } | null,
  data: BoardViewData,
): Promise<void> {
  return log((base) => boardView({ ...base, issue, data }), "Page view");
}

export function logPage(data: BoardPageData): Promise<void> {
  return log((base) => boardPage({ ...base, data }), "Page state");
}

export function logProfile(data: BoardProfileData): Promise<void> {
  return log((base) => boardProfile({ ...base, data }), "Profile answers");
}

/**
 * The issue the page on screen is about, set by that page so its view names the issue and the
 * revision live at the time. Children's effects run before the layout's, so it is set by the
 * time the view is recorded.
 */
let context: { path: string; issue: { id: string; revision: string } } | null = null;

export function setIssueContext(issue: { id: string; revision: string } | null): () => void {
  const path = location.pathname;
  context = issue ? { path, issue } : null;
  return () => {
    if (context?.path === path) context = null;
  };
}

export function issueContext(path: string): { id: string; revision: string } | null {
  return context?.path === path ? context.issue : null;
}

async function log(
  build: (base: BoardBase) => BoardObservation,
  what: string,
): Promise<void> {
  const accepted = readProfile()?.accepted;
  // The gate keeps people without current acceptance out; this is the belt to its braces.
  if (!accepted || !acceptsCurrent(accepted)) return;
  // Claim the position and time now, so order matches what the person did.
  const position = ++sequence;
  const occurredAt = new Date().toISOString();
  // performance.now() counts from this page load, which is this source stream.
  const elapsedMs = Math.round(performance.now() * 10) / 10;
  try {
    store ??= openPracticeStore();
    const opened = await store;
    pending.push(
      boardRecord(
        build({
          participantId: await opened.participantId(),
          sourceId,
          sequence: position,
          occurredAt,
          elapsedMs,
          termsVersion: accepted.version,
        }),
      ),
    );
    const batch = pending.splice(0);
    try {
      await opened.write(batch);
    } catch (cause) {
      pending.unshift(...batch);
      throw cause;
    }
  } catch (cause) {
    store = null;
    // A missed position stays visible as a gap in the source stream.
    console.warn(`${what} was not recorded.`, cause);
  }
}
