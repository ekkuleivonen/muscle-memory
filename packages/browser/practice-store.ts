/** Optional device-local storage. This module sends no records over the network. */
import {
  createAttemptEvent,
  encodeEvent,
  type AttemptEvent,
} from "../domain/events";

const DATABASE = "muscle-memory-local-practice";
export class PracticeStore {
  constructor(private readonly database: IDBDatabase) {}

  participantId(): Promise<string> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("settings", "readwrite");
      const settings = transaction.objectStore("settings");
      let id: string;
      const request = settings.get("participantId");
      request.onsuccess = () => {
        id = request.result ?? crypto.randomUUID();
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

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["events", "settings"],
        "readwrite",
      );
      transaction.objectStore("events").clear();
      transaction.objectStore("settings").clear();
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
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("events", { keyPath: "eventId" });
      request.result.createObjectStore("settings");
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
