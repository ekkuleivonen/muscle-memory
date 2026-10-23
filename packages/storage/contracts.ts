/** Transactional storage and bulk archive stay separate behind this small port. */
export interface StoredEvent {
  readonly eventId: string;
  readonly payload: string;
}
export interface EventOutbox {
  pending(): StoredEvent[];
  acknowledge(eventId: string, payload: string): void;
}
/** Durable participant deletion progress; archive files are removed outside the transaction. */
export interface ParticipantDeletionStore {
  /** Deletes rows and blocks re-append in one transaction; returns event IDs whose archive files remain. */
  beginParticipantDeletion(participantId: string): string[];
  /** Records an archive file that is confirmed absent. */
  confirmFileDeleted(eventId: string): void;
}
