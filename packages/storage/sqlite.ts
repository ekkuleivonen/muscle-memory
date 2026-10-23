/** Local transactional adapter; not imported by the Cloudflare app runtime. */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import {
  createAttemptEvent,
  encodeEvent,
  safeIdentifier,
  type AttemptEvent,
} from "../domain/events";

import type { StoredEvent, EventOutbox } from "./contracts";

export class SqliteEventStore implements EventOutbox {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    const schema = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (![0, 1].includes(schema.user_version)) {
      this.db.close();
      throw new Error("Unsupported local database version.");
    }
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA user_version = 1;
      CREATE TABLE IF NOT EXISTS attempt_events (
        event_id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        export_state TEXT NOT NULL DEFAULT 'pending' CHECK(export_state IN ('pending','exported'))
      );
    `);
  }

  append(event: AttemptEvent): { eventId: string; duplicate: boolean } {
    safeIdentifier(event.eventId);
    safeIdentifier(event.participantId);
    if (event.schemaVersion !== "1.0.0" || event.type !== "attempt.assessed")
      throw new Error("Unsupported event schema.");
    const payload = encodeEvent(event);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT payload FROM attempt_events WHERE event_id = ?")
        .get(event.eventId);
      if (existing && existing.payload !== payload)
        throw new Error("Event ID already exists with different content.");
      if (!existing) {
        const verified = createAttemptEvent(
          event.adventureSnapshot,
          event.challengeSnapshot,
          event.attempt,
        );
        if (encodeEvent(verified) !== payload)
          throw new Error(
            "Event envelope or assessment does not match its source snapshots.",
          );
        this.db
          .prepare(
            "INSERT INTO attempt_events(event_id, participant_id, payload) VALUES (?, ?, ?)",
          )
          .run(event.eventId, event.participantId, payload);
      }
      // Pending export state is in the same row: append and outbox are one transaction.
      this.db.exec("COMMIT");
      return { eventId: event.eventId, duplicate: Boolean(existing) };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  pending(): StoredEvent[] {
    return this.db
      .prepare(
        "SELECT event_id AS eventId, payload FROM attempt_events WHERE export_state = 'pending' ORDER BY event_id",
      )
      .all() as unknown as StoredEvent[];
  }
  get(eventId: string): StoredEvent | undefined {
    return this.db
      .prepare(
        "SELECT event_id AS eventId, payload FROM attempt_events WHERE event_id = ?",
      )
      .get(eventId) as unknown as StoredEvent | undefined;
  }
  acknowledge(eventId: string, payload: string): void {
    const result = this.db
      .prepare(
        "UPDATE attempt_events SET export_state = 'exported' WHERE event_id = ? AND payload = ?",
      )
      .run(eventId, payload);
    if (result.changes !== 1)
      throw new Error("Cannot acknowledge a missing or changed event.");
  }
  close(): void {
    this.db.close();
  }
}
