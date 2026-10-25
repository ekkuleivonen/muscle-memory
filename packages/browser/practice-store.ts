/**
 * Device-local storage: the pseudonymous identity, every workspace and board record, and an
 * outbox of records not yet uploaded (packages/browser/uploader.ts sends them). This module
 * itself sends nothing over the network.
 */
import { randomId } from "./random-id";
import type { WorkspaceRecord } from "../domain/workspace";
import type { CaptureSink, WriteOutcome } from "../capture/recorder";

const DATABASE = "muscle-memory-local-practice";

/** Everything the store holds, for a backup: settings, every record, and what is still queued. */
export interface StoreDump {
  /** The identity, device secret and referral code. */
  readonly settings: Readonly<Record<string, string>>;
  readonly records: readonly WorkspaceRecord[];
  /** Record IDs still waiting to be uploaded, oldest first. */
  readonly outbox: readonly string[];
}

export class PracticeStore implements CaptureSink {
  constructor(private readonly database: IDBDatabase) {}

  participantId(): Promise<string> {
    return this.setting("participantId", randomId);
  }

  /**
   * A secret only this device knows, made with the identity. Uploads prove they come from the
   * device that owns the participant ID with its hash, and a deletion request with the secret
   * itself, so nobody else can add to or delete someone's data.
   */
  deviceSecret(): Promise<string> {
    return this.setting("deviceSecret", () => randomId() + randomId());
  }

  /**
   * This device's referral code, carried by the links its result cards share. Random and
   * separate from the participant ID, so a public link never reveals it.
   */
  referralCode(): Promise<string> {
    return this.setting("referralCode", () => randomId().replace(/-/g, "").slice(0, 12));
  }

  private setting(key: string, make: () => string): Promise<string> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("settings", "readwrite");
      const settings = transaction.objectStore("settings");
      let value: string;
      const request = settings.get(key);
      request.onsuccess = () => {
        value = request.result ?? make();
        if (!request.result) settings.put(value, key);
      };
      transaction.oncomplete = () => resolve(value);
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
      const transaction = this.database.transaction(["workspace", "outbox"], "readwrite");
      const store = transaction.objectStore("workspace");
      // Every new record is queued for upload in the same transaction, in write order.
      const outbox = transaction.objectStore("outbox");
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
                outbox.add(record.recordId);
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

  /**
   * The oldest records waiting to be uploaded: at most `limit`, stopping before `maxBytes` of
   * payload (always at least one). `keys` are every outbox entry covered, including any whose
   * record no longer exists, so marking them sent never leaves one stuck.
   */
  pending(
    limit: number,
    maxBytes: number,
  ): Promise<{ keys: IDBValidKey[]; records: WorkspaceRecord[] }> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(["outbox", "workspace"], "readonly");
      const store = transaction.objectStore("workspace");
      const keys: IDBValidKey[] = [];
      const records: WorkspaceRecord[] = [];
      let bytes = 0;
      const cursor = transaction.objectStore("outbox").openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at || records.length >= limit) return;
        const get = store.get(at.value as string);
        get.onsuccess = () => {
          const record = get.result as WorkspaceRecord | undefined;
          if (record) {
            if (records.length && bytes + record.payload.length > maxBytes) return;
            bytes += record.payload.length;
            records.push(record);
          }
          keys.push(at.primaryKey);
          at.continue();
        };
      };
      transaction.oncomplete = () => resolve({ keys, records });
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("The upload queue could not be read."));
    });
  }

  /** Removes uploaded records from the outbox; the records themselves stay on the device. */
  sent(keys: readonly IDBValidKey[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("outbox", "readwrite");
      const outbox = transaction.objectStore("outbox");
      for (const key of keys) outbox.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("The upload queue could not be updated."));
    });
  }

  /** How many records are waiting to be uploaded. */
  waiting(): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("outbox", "readonly");
      const request = transaction.objectStore("outbox").count();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("The upload queue could not be read."));
    });
  }

  /**
   * Clears workspace observations and artifacts and the outbox, and with `identity` the local
   * identity and device secret too. Keeping them (a reset) keeps uploaded data deletable.
   */
  clear(identity = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "workspace", "outbox"],
        "readwrite",
      );
      if (identity) transaction.objectStore("settings").clear();
      transaction.objectStore("workspace").clear();
      transaction.objectStore("outbox").clear();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Saved practice could not be cleared."),
        );
    });
  }
  dump(): Promise<StoreDump> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "workspace", "outbox"],
        "readonly",
      );
      const settings: Record<string, string> = {};
      const outbox: string[] = [];
      const cursor = transaction.objectStore("settings").openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at) return;
        settings[String(at.key)] = at.value as string;
        at.continue();
      };
      const records = transaction.objectStore("workspace").getAll();
      const queued = transaction.objectStore("outbox").openCursor();
      queued.onsuccess = () => {
        const at = queued.result;
        if (!at) return;
        outbox.push(at.value as string);
        at.continue();
      };
      transaction.oncomplete = () =>
        resolve({ settings, records: records.result as WorkspaceRecord[], outbox });
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Saved practice could not be read."));
    });
  }

  /**
   * Replaces everything with a dump, in one transaction: the identity and secret it carries,
   * its records, and its upload queue in the same order. Nothing is kept from before.
   */
  restore(dump: StoreDump): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "workspace", "outbox"],
        "readwrite",
      );
      const settings = transaction.objectStore("settings");
      const workspace = transaction.objectStore("workspace");
      const outbox = transaction.objectStore("outbox");
      settings.clear();
      workspace.clear();
      outbox.clear();
      for (const [key, value] of Object.entries(dump.settings)) settings.put(value, key);
      for (const record of dump.records) workspace.put(record);
      for (const id of dump.outbox) outbox.add(id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("The backup could not be restored."));
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
    // Version 4 adds the upload outbox. Version 3: workspace records name issues and
    // revisions; older stores are rebuilt rather than migrated, keeping the local identity.
    const request = factory.open(DATABASE, 4);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) database.createObjectStore("settings");
      if (event.oldVersion < 3) {
        for (const legacy of ["events", "workspace"])
          if (database.objectStoreNames.contains(legacy))
            database.deleteObjectStore(legacy);
        database.createObjectStore("workspace", { keyPath: "recordId" });
      }
      if (event.oldVersion < 4) {
        const outbox = database.createObjectStore("outbox", { autoIncrement: true });
        // Records made before the outbox existed are queued too, so nothing is skipped.
        const existing = request.transaction!.objectStore("workspace").openCursor();
        existing.onsuccess = () => {
          const at = existing.result;
          if (!at) return;
          outbox.add(at.primaryKey);
          at.continue();
        };
      }
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
