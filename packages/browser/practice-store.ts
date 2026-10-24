/** Optional device-local storage. This module sends no records over the network. */
import { randomId } from "./random-id";
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

  /** Clears workspace observations and artifacts and the local identity together. */
  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "workspace"],
        "readwrite",
      );
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
    // Version 3: workspace records name issues and revisions. Nothing was released before it,
    // so older stores are rebuilt rather than migrated; only the local identity is kept.
    const request = factory.open(DATABASE, 3);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) database.createObjectStore("settings");
      for (const legacy of ["events", "workspace"])
        if (database.objectStoreNames.contains(legacy))
          database.deleteObjectStore(legacy);
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
