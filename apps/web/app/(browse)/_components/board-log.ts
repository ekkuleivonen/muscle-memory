/**
 * Records board moves on this device, only while the activity log has consent. One source
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
  type BoardMoveData,
} from "../../../../../packages/domain/board";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { ACTIVITY_KEY, parseConsent } from "../../../lib/activity-log";

const sourceId = `board-${randomId()}`;
let sequence = 0;
let store: Promise<PracticeStore> | null = null;
const pending: WorkspaceRecord[] = [];

export function activityLogOn(): boolean {
  return parseConsent(localStorage.getItem(ACTIVITY_KEY)) !== null;
}

export async function logBoardMove(
  challenge: { id: string; version: string },
  data: BoardMoveData,
): Promise<void> {
  if (!activityLogOn()) return;
  // Claim the position and time now, so order matches what the person did.
  const position = ++sequence;
  const occurredAt = new Date().toISOString();
  try {
    store ??= openPracticeStore();
    const opened = await store;
    pending.push(
      boardRecord(
        boardMove({
          participantId: await opened.participantId(),
          sourceId,
          sequence: position,
          occurredAt,
          challenge,
          data,
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
    console.warn("Board move was not recorded.", cause);
  }
}
