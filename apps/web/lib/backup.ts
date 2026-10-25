/**
 * A backup of everything this browser holds, so practice can move to another browser or
 * survive clearing this one: the profile, progress, stars and settings (localStorage), and the practice
 * store (identity, device secret, every record, and the upload queue). There are no accounts;
 * this file is the account. It carries the device secret, which can delete what was uploaded,
 * so it is to be kept private.
 */
import { openPracticeStore, type StoreDump } from "../../../packages/browser/practice-store";
import type { StoredRecord } from "../../../packages/domain/records";
import { ACCOUNT_CHANGE, acceptConsent, parseStoredProfile } from "./account";
import { PROGRESS_CHANGE } from "./progress";
import { acceptsCurrent } from "./legal";
import { PROFILE_KEY } from "./profile";

export const BACKUP_KIND = "muscle-memory-backup";
export const BACKUP_VERSION = 1;
const PREFIX = "muscle-memory.";
/** Where this tab was a moment ago: meaningless anywhere else. */
const TRANSIENT = new Set([`${PREFIX}previous-path`, `${PREFIX}current-path`]);

export interface Backup {
  readonly kind: typeof BACKUP_KIND;
  readonly version: typeof BACKUP_VERSION;
  readonly exportedAt: string;
  /** localStorage entries under muscle-memory.*, as stored. */
  readonly local: Readonly<Record<string, string>>;
  readonly store: StoreDump;
}

/** What a backup holds, for the confirmation before it replaces anything. */
export interface BackupSummary {
  readonly handle: string | null;
  readonly participantId: string | null;
  readonly records: number;
  readonly exportedAt: string;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isRecord = (value: unknown): value is StoredRecord =>
  !!value &&
  typeof value === "object" &&
  isString((value as StoredRecord).recordId) &&
  isString((value as StoredRecord).kind) &&
  isString((value as StoredRecord).participantId) &&
  isString((value as StoredRecord).payload);
const isStringMap = (value: unknown): value is Record<string, string> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).every(isString);

/** A backup from a file's text, or an error that says what is wrong with it. */
export function parseBackup(text: string): Backup | Error {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return new Error("That file isn't a Muscle Memory backup: it isn't JSON.");
  }
  const backup = value as Partial<Backup> | null;
  if (backup?.kind !== BACKUP_KIND) return new Error("That file isn't a Muscle Memory backup.");
  if (backup.version !== BACKUP_VERSION)
    return new Error(`That backup is version ${String(backup.version)}; this site reads version ${BACKUP_VERSION}.`);
  const store = backup.store as Partial<StoreDump> | undefined;
  const ok =
    isString(backup.exportedAt) &&
    isStringMap(backup.local) &&
    Object.keys(backup.local).every((key) => key.startsWith(PREFIX)) &&
    !!store &&
    isStringMap(store.settings) &&
    Array.isArray(store.records) &&
    store.records.every(isRecord) &&
    Array.isArray(store.outbox) &&
    store.outbox.every(isString);
  if (!ok) return new Error("That backup is damaged: some of it is missing or malformed.");
  return backup as Backup;
}

export function summarize(backup: Backup): BackupSummary {
  const profile = parseStoredProfile(backup.local[PROFILE_KEY] ?? null);
  return {
    handle: profile?.handle ?? null,
    participantId: backup.store.settings.participantId ?? null,
    records: backup.store.records.length,
    exportedAt: backup.exportedAt,
  };
}

/** Everything this browser holds, as a backup. */
export async function makeBackup(): Promise<Backup> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(PREFIX) && !TRANSIENT.has(key)) local[key] = localStorage.getItem(key)!;
  }
  const store = await openPracticeStore();
  try {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      local,
      store: await store.dump(),
    };
  } finally {
    store.close();
  }
}

/** This browser's own participant ID and how many records it holds, before a restore. */
export async function current(): Promise<{ participantId: string | null; records: number }> {
  const store = await openPracticeStore();
  try {
    const dump = await store.dump();
    return { participantId: dump.settings.participantId ?? null, records: dump.records.length };
  } finally {
    store.close();
  }
}

/**
 * Replaces everything this browser holds with a backup, and signs in when the backup accepted
 * the current Terms (otherwise /consent asks). The caller reloads the app afterwards.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const store = await openPracticeStore();
  try {
    await store.restore(backup.store);
  } finally {
    store.close();
  }
  for (const key of Object.keys(localStorage))
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(backup.local)) localStorage.setItem(key, value);
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
  window.dispatchEvent(new Event(PROGRESS_CHANGE));
  const profile = parseStoredProfile(backup.local[PROFILE_KEY] ?? null);
  if (profile && !profile.signedOut && acceptsCurrent(profile.accepted)) acceptConsent();
}

/** The file name a backup downloads as. */
export function backupName(handle: string | null, at: Date): string {
  return `muscle-memory-${(handle ?? "backup").toLowerCase()}-${at.toISOString().slice(0, 10)}.json`;
}
