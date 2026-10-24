/** Optional device-local storage. This module sends no records over the network. */
import { randomId } from "./random-id";
import {
  createAttemptEvent,
  encodeEvent,
  type AttemptEvent,
} from "../domain/events";
import type { WorkspaceRecord } from "../domain/workspace";
import type { CaptureSink, WriteOutcome } from "../capture/recorder";

const DATABASE = "muscle-memory-local-practice";
export class PracticeStore implements CaptureSink {
  constructor(private readonly database: IDBDatabase) {}

  participantId(): Promise<string> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("settings", "readwrite");
      const settings = transaction.objectStore("settings");
      let id: string;
      const request = settings.get("participantId");
      request.onsuccess = () => {
        id = request.result ?? randomId();
        if (!request.result) settings.put(id, "participantId");
      };
      transaction.oncomplete = () => resolve(id);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Local identity could not be saved."),
        );
    });
  }

  append(
    event: AttemptEvent,
  ): Promise<{ eventId: string; duplicate: boolean }> {
    const payload = encodeEvent(event);
    const verified = createAttemptEvent(
      event.adventureSnapshot,
      event.challengeSnapshot,
      event.attempt,
    );
    if (encodeEvent(verified) !== payload)
      return Promise.reject(
        new Error("Event assessment does not match its snapshots."),
      );
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("events", "readwrite");
      const events = transaction.objectStore("events");
      let duplicate = false;
      let failure: Error | null = null;
      const request = events.get(event.eventId);
      request.onsuccess = () => {
        if (request.result) {
          if (request.result.payload !== payload) {
            failure = new Error(
              "Event ID already exists with different content.",
            );
            transaction.abort();
          } else duplicate = true;
        } else events.add({ eventId: event.eventId, payload });
      };
      // Acknowledge only when IndexedDB commits, not when add() is requested.
      transaction.oncomplete = () =>
        resolve({ eventId: event.eventId, duplicate });
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new Error("Practice could not be saved on this device."),
        );
    });
  }

  pending(): Promise<AttemptEvent[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("events", "readonly");
      const request = transaction.objectStore("events").getAll();
      transaction.oncomplete = () =>
        resolve(
          request.result.map((row) => JSON.parse(row.payload) as AttemptEvent),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Saved practice could not be read."),
        );
    });
  }

  /**
   * Writes one batch of workspace observations and artifacts in one transaction. Existing
   * identical records are duplicates; a different payload under the same ID is a conflict
   * and is not written. If the transaction aborts, nothing in the batch is acknowledged.
   */
  write(records: readonly WorkspaceRecord[]): Promise<WriteOutcome[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("workspace", "readwrite");
      const store = transaction.objectStore("workspace");
      const outcomes: WriteOutcome[] = [];
      let failure: unknown;
      // A synchronous throw (such as an invalid key) must abort the whole batch, not
      // just reject while earlier requests in the same transaction still commit.
      const guarded = (action: () => void) => {
        if (failure) return;
        try {
          action();
        } catch (error) {
          failure = error;
          try {
            transaction.abort();
          } catch {
            // Already finishing; onabort still reports the first failure.
          }
        }
      };
      transaction.oncomplete = () => resolve(outcomes);
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new Error("Workspace activity could not be saved on this device."),
        );
      records.forEach((record, index) =>
        guarded(() => {
          const request = store.get(record.recordId);
          request.onsuccess = () =>
            guarded(() => {
              const existing = request.result as WorkspaceRecord | undefined;
              if (!existing) {
                store.add(record);
                outcomes[index] = "written";
              } else
                outcomes[index] =
                  existing.payload === record.payload
                    ? "duplicate"
                    : "conflict";
            });
        }),
      );
    });
  }

  workspaceRecords(): Promise<WorkspaceRecord[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("workspace", "readonly");
      const request = transaction.objectStore("workspace").getAll();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Saved workspace could not be read."),
        );
    });
  }

  /** Clears attempts, workspace observations and artifacts, and the local identity together. */
  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["events", "settings", "workspace"],
        "readwrite",
      );
      transaction.objectStore("events").clear();
      transaction.objectStore("settings").clear();
      transaction.objectStore("workspace").clear();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Saved practice could not be cleared."),
        );
    });
  }
  close(): void {
    this.database.close();
  }
}

export function openPracticeStore(
  factory: IDBFactory = indexedDB,
): Promise<PracticeStore> {
  return new Promise((resolve, reject) => {
    // Version 2 adds workspace records; existing attempts and identity are kept.
    const request = factory.open(DATABASE, 2);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        database.createObjectStore("events", { keyPath: "eventId" });
        database.createObjectStore("settings");
      }
      if (event.oldVersion < 2)
        database.createObjectStore("workspace", { keyPath: "recordId" });
    };
    request.onsuccess = () => resolve(new PracticeStore(request.result));
    request.onerror = () =>
      reject(
        request.error ?? new Error("Device-local storage is unavailable."),
      );
    request.onblocked = () =>
      reject(new Error("Close other practice tabs and try again."));
  });
}

/** Download is retryable, but is not proof of a successful disk write; never acknowledge it. */
export function encodePendingExport(events: readonly AttemptEvent[]): string {
  return events.map(encodeEvent).join("\n") + (events.length ? "\n" : "");
}
