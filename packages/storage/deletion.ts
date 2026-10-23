/** Participant-scoped local deletion across the SQLite store and its single archive directory. */
import type { ParticipantDeletionStore } from "./contracts";
import { removeArchivedEvent } from "./export";

export interface DeletionResult {
  participantId: string;
  /** True only when stored rows are gone and every owned archive file is confirmed absent. */
  complete: boolean;
  /** Event IDs whose archive files could not be removed; rerun to retry after fixing the cause. */
  remainingFiles: string[];
  errors: string[];
}

/**
 * Safe to repeat. Rows are deleted and the participant retired in one transaction,
 * then owned archive files are removed. Files that fail stay recorded for a retry,
 * including after the store is reopened.
 */
export async function deleteParticipant(
  store: ParticipantDeletionStore,
  participantId: string,
  directory: string,
  remove = removeArchivedEvent,
): Promise<DeletionResult> {
  const remainingFiles: string[] = [];
  const errors: string[] = [];
  for (const eventId of store.beginParticipantDeletion(participantId)) {
    try {
      await remove(directory, eventId);
      store.confirmFileDeleted(eventId);
    } catch (error) {
      remainingFiles.push(eventId);
      errors.push(`${eventId}: ${(error as Error).message}`);
    }
  }
  return {
    participantId,
    complete: remainingFiles.length === 0,
    remainingFiles,
    errors,
  };
}
