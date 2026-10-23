/** Transactional storage and bulk archive stay separate behind this small port. */
export interface StoredEvent {
  readonly eventId: string;
  readonly payload: string;
}
export interface EventOutbox {
  pending(): StoredEvent[];
  acknowledge(eventId: string, payload: string): void;
}
