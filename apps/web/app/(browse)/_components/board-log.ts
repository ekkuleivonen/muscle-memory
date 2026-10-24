/**
 * Records board moves and replies to review comments on this device for accounts that accepted the current Terms, stamped
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
  boardMove,
  boardRecord,
  boardReply,
  type BoardMoveData,
  type BoardObservation,
} from "../../../../../packages/domain/board";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { readProfile } from "../../../lib/account";
import { acceptsCurrent } from "../../../lib/legal";

const sourceId = `board-${randomId()}`;
let sequence = 0;
let store: Promise<PracticeStore> | null = null;
const pending: WorkspaceRecord[] = [];

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

async function log(
  build: (base: {
    participantId: string;
    sourceId: string;
    sequence: number;
    occurredAt: string;
    termsVersion: string;
  }) => BoardObservation,
  what: string,
): Promise<void> {
  const accepted = readProfile()?.accepted;
  // The gate keeps people without current acceptance out; this is the belt to its braces.
  if (!accepted || !acceptsCurrent(accepted)) return;
  // Claim the position and time now, so order matches what the person did.
  const position = ++sequence;
  const occurredAt = new Date().toISOString();
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
