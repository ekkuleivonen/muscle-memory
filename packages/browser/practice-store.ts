/**
 * Device-local storage: the pseudonymous identity, every practice and site record, and an
 * outbox of records not yet uploaded (packages/browser/uploader.ts sends them). Once uploaded,
 * what practice no longer needs is forgotten (`compact`). This module itself sends nothing
 * over the network.
 */
import { randomId } from "./random-id";
import type { StoredRecord } from "../domain/records";
import type { CaptureSink, WriteOutcome } from "../capture/recorder";
import { compactable } from "./compaction";
import { solvedLength } from "../model-runs/comparison";
import {
  deriveAttempts,
  type AttemptSummary,
} from "../developer-profile/derive";
import {
  SUMMARY_KEY,
  METRIC_VERSION,
  PROFILE_HISTORY_ENABLED,
} from "../developer-profile/registry";

const DATABASE = "muscle-memory-local-practice";

/** Everything the store holds, for a backup: settings, every record, and what is still queued. */
export interface StoreDump {
  /** The identity, device secret and referral code. */
  readonly settings: Readonly<Record<string, string>>;
  readonly records: readonly StoredRecord[];
  /** Record IDs still waiting to be uploaded, oldest first. */
  readonly outbox: readonly string[];
}

export class PracticeStore implements CaptureSink {
  constructor(private readonly database: IDBDatabase) {}

  /** Read without creating an identity merely to view statistics. */
  existingIdentity(): Promise<{ participant: string; secret: string } | null> {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction("settings", "readonly"),
        settings = tx.objectStore("settings");
      const participant = settings.get("participantId"),
        secret = settings.get("deviceSecret");
      tx.oncomplete = () =>
        resolve(
          typeof participant.result === "string" &&
            typeof secret.result === "string"
            ? { participant: participant.result, secret: secret.result }
            : null,
        );
      tx.onabort = () =>
        reject(tx.error ?? new Error("Device identity could not be read."));
    });
  }

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
    return this.setting("referralCode", () =>
      randomId().replace(/-/g, "").slice(0, 12),
    );
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
   * Writes one batch of observations and artifacts in one transaction. Existing
   * identical records are duplicates; a different payload under the same ID is a conflict
   * and is not written. If the transaction aborts, nothing in the batch is acknowledged.
   */
  write(records: readonly StoredRecord[]): Promise<WriteOutcome[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["records", "outbox"],
        "readwrite",
      );
      const store = transaction.objectStore("records");
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
            new Error("Practice could not be saved on this device."),
        );
      records.forEach((record, index) =>
        guarded(() => {
          const request = store.get(record.recordId);
          request.onsuccess = () =>
            guarded(() => {
              const existing = request.result as StoredRecord | undefined;
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

  /** Atomically validate current records and append derived records/outbox entries. */
  commit(
    build: (records: readonly StoredRecord[]) => readonly StoredRecord[],
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["records", "outbox"],
        "readwrite",
      );
      const stored = transaction.objectStore("records");
      let changed = false;
      let failure: unknown;
      const request = stored.getAll();
      request.onsuccess = () => {
        try {
          const records = build(request.result);
          for (const record of records) {
            stored.add(record);
            transaction.objectStore("outbox").add(record.recordId);
          }
          changed = records.length > 0;
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(changed);
      transaction.onabort = () => reject(failure ?? transaction.error);
    });
  }

  records(): Promise<StoredRecord[]> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("records", "readonly");
      const request = transaction.objectStore("records").getAll();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Saved practice could not be read."),
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
  ): Promise<{ keys: IDBValidKey[]; records: StoredRecord[] }> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["outbox", "records"],
        "readonly",
      );
      const store = transaction.objectStore("records");
      const keys: IDBValidKey[] = [];
      const records: StoredRecord[] = [];
      let bytes = 0;
      const cursor = transaction.objectStore("outbox").openCursor();
      cursor.onsuccess = () => {
        const at = cursor.result;
        if (!at || records.length >= limit) return;
        const get = store.get(at.value as string);
        get.onsuccess = () => {
          const record = get.result as StoredRecord | undefined;
          if (record) {
            if (records.length && bytes + record.payload.length > maxBytes)
              return;
            bytes += record.payload.length;
            records.push(record);
          }
          keys.push(at.primaryKey);
          at.continue();
        };
      };
      transaction.oncomplete = () => resolve({ keys, records });
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("The upload queue could not be read."),
        );
    });
  }

  /** Removes uploaded records from the outbox; the records stay until `compact`. */
  sent(keys: readonly IDBValidKey[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("outbox", "readwrite");
      const outbox = transaction.objectStore("outbox");
      for (const key of keys) outbox.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("The upload queue could not be updated."),
        );
    });
  }

  /**
   * Forgets what is uploaded and no longer needed here (./compaction.ts), in one transaction.
   * Returns how many records went. Summary retention is release-gated by the privacy
   * disclosure; the explicit override exercises the future path in synthetic tests only.
   */
  compact(
    retainProfileSummaries: boolean = PROFILE_HISTORY_ENABLED,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["records", "outbox", "settings"],
        "readwrite",
      );
      const stored = transaction.objectStore("records");
      const summaries = transaction.objectStore("settings").get(SUMMARY_KEY);
      let removed = 0;
      const records = stored.getAll();
      const queued = transaction.objectStore("outbox").getAll();
      queued.onsuccess = () => {
        const ids = compactable(
          records.result as StoredRecord[],
          new Set(queued.result as string[]),
        );
        if (!ids.length) return;
        if (!retainProfileSummaries) {
          for (const id of ids) stored.delete(id);
          removed = ids.length;
          return;
        }
        try {
          const all = records.result as StoredRecord[];
          const removedIds = new Set(ids);
          const removedAttempts = new Set(
            all
              .filter((r) => removedIds.has(r.recordId))
              .flatMap((r) => {
                try {
                  const o = JSON.parse(r.payload);
                  return o.attemptId ? [o.attemptId] : [];
                } catch {
                  return [];
                }
              }),
          );
          const previous = JSON.parse(
            summaries.result ?? "[]",
          ) as AttemptSummary[];
          const next = previous.filter((s) => s.version === METRIC_VERSION);
          for (const participant of new Set(all.map((r) => r.participantId))) {
            for (const summary of deriveAttempts(all, participant)) {
              if (!removedAttempts.has(summary.attempt)) continue;
              const index = next.findIndex(
                (s) =>
                  s.participant === summary.participant &&
                  s.attempt === summary.attempt &&
                  s.revision === summary.revision,
              );
              if (index < 0) next.push(summary);
              else next[index] = summary;
            }
          }
          transaction
            .objectStore("settings")
            .put(JSON.stringify(next), SUMMARY_KEY);
          for (const id of ids) stored.delete(id);
          removed = ids.length;
        } catch {
          // Fail atomically: never discard raw evidence if its summary cannot be retained.
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(removed);
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Saved practice could not be compacted."),
        );
    });
  }

  /** How many records are waiting to be uploaded. */
  waiting(): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction("outbox", "readonly");
      const request = transaction.objectStore("outbox").count();
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("The upload queue could not be read."),
        );
    });
  }

  /**
   * Clears observations and artifacts and the outbox, and with `identity` the local
   * identity and device secret too. Keeping them (a reset) keeps uploaded data deletable.
   */
  clear(identity = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "records", "outbox"],
        "readwrite",
      );
      if (identity) transaction.objectStore("settings").clear();
      else transaction.objectStore("settings").delete(SUMMARY_KEY);
      transaction.objectStore("records").clear();
      transaction.objectStore("outbox").clear();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Saved practice could not be cleared."),
        );
    });
  }
  /** Report evidence only: no code artifacts, upload queue or unrelated settings. */
  evidence(signal?: AbortSignal): Promise<StoreDump> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("Practice read cancelled."));
      const tx = this.database.transaction(["settings", "records"], "readonly");
      const settings: Record<string, string> = {};
      const records: StoredRecord[] = [];
      const stop = () => {
        try {
          tx.abort();
        } catch {}
      };
      signal?.addEventListener("abort", stop, { once: true });
      const participant = tx.objectStore("settings").get("participantId");
      const summaries = tx.objectStore("settings").get(SUMMARY_KEY);
      participant.onsuccess = () => {
        if (typeof participant.result !== "string") return;
        settings.participantId = participant.result;
        const cursor = tx.objectStore("records").openCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) return;
          const r = at.value as StoredRecord;
          if (
            r.kind === "observation" &&
            r.participantId === settings.participantId
          )
            records.push(r);
          at.continue();
        };
      };
      summaries.onsuccess = () => {
        if (typeof summaries.result === "string")
          settings[SUMMARY_KEY] = summaries.result;
      };
      tx.oncomplete = () => {
        signal?.removeEventListener("abort", stop);
        resolve({ settings, records, outbox: [] });
      };
      tx.onabort = () => {
        signal?.removeEventListener("abort", stop);
        reject(tx.error ?? new Error("Practice could not be read."));
      };
    });
  }

  /**
   * The code length of each given solved attempt, in characters, from code still kept here:
   * numbers only, so no code leaves this module. An attempt whose code was compacted away, or
   * whose provenance doesn't agree (`solvedLength`), is simply absent. At most three per call.
   */
  solvedCodeLengths(
    attempts: readonly { challenge: string; revision: string; attempt: string }[],
    signal?: AbortSignal,
  ): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("Practice read cancelled."));
      if (attempts.length > 3)
        return reject(new Error("At most three code lengths per read."));
      const wanted = new Set(attempts.map((a) => a.attempt));
      const tx = this.database.transaction(["settings", "records"], "readonly");
      const records: StoredRecord[] = [];
      let owner: string | null = null;
      const stop = () => {
        try {
          tx.abort();
        } catch {}
      };
      signal?.addEventListener("abort", stop, { once: true });
      const participant = tx.objectStore("settings").get("participantId");
      participant.onsuccess = () => {
        if (typeof participant.result !== "string") return;
        owner = participant.result;
        const cursor = tx.objectStore("records").openCursor();
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at) return;
          const r = at.value as StoredRecord;
          if (r.participantId === owner) {
            if (r.kind === "artifact") records.push(r);
            else
              try {
                if (wanted.has(JSON.parse(r.payload).attemptId)) records.push(r);
              } catch {}
          }
          at.continue();
        };
      };
      tx.oncomplete = () => {
        signal?.removeEventListener("abort", stop);
        const out: Record<string, number> = {};
        for (const a of attempts) {
          const n = solvedLength(records, a.challenge, a.revision, a.attempt);
          if (n !== null && n > 0) out[a.attempt] = n;
        }
        resolve(out);
      };
      tx.onabort = () => {
        signal?.removeEventListener("abort", stop);
        reject(tx.error ?? new Error("Practice could not be read."));
      };
    });
  }

  dump(): Promise<StoreDump> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "records", "outbox"],
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
      const records = transaction.objectStore("records").getAll();
      const queued = transaction.objectStore("outbox").openCursor();
      queued.onsuccess = () => {
        const at = queued.result;
        if (!at) return;
        outbox.push(at.value as string);
        at.continue();
      };
      transaction.oncomplete = () =>
        resolve({
          settings,
          records: records.result as StoredRecord[],
          outbox,
        });
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Saved practice could not be read."),
        );
    });
  }

  /**
   * Replaces everything with a dump, in one transaction: the identity and secret it carries,
   * its records, and its upload queue in the same order. Nothing is kept from before.
   */
  restore(dump: StoreDump): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(
        ["settings", "records", "outbox"],
        "readwrite",
      );
      const settings = transaction.objectStore("settings");
      const stored = transaction.objectStore("records");
      const outbox = transaction.objectStore("outbox");
      settings.clear();
      stored.clear();
      outbox.clear();
      for (const [key, value] of Object.entries(dump.settings))
        settings.put(value, key);
      for (const record of dump.records) stored.put(record);
      for (const id of dump.outbox) outbox.add(id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("The backup could not be restored."),
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
    const request = factory.open(DATABASE, 5);
    request.onupgradeneeded = () => {
      const database = request.result;
      const stores = database.objectStoreNames;
      if (!stores.contains("settings")) database.createObjectStore("settings");
      if (!stores.contains("records"))
        database.createObjectStore("records", { keyPath: "recordId" });
      if (!stores.contains("outbox"))
        database.createObjectStore("outbox", { autoIncrement: true });
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
