/**
 * The account as it exists so far: a profile and handle in this browser's storage, and a
 * cookie that stands in for a session. Browser-only; the server sees just the cookie.
 */
import {
  encodePendingExport,
  openPracticeStore,
} from "../../../packages/browser/practice-store";
import { boardPayloads } from "../../../packages/domain/board";
import { ACTIVITY_KEY } from "./activity-log";
import { BOARD_CHANGE, BOARD_KEY } from "./board";
import { HANDLE_PATTERN, randomHandle } from "./handle";
import {
  ONBOARDING_COOKIE,
  ONBOARDING_VERSION,
  PROFILE_KEY,
  type Profile,
  type StoredProfile,
} from "./onboarding";

/** Same-tab change notice; other tabs hear the storage event. */
export const ACCOUNT_CHANGE = "muscle-memory:account";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseStoredProfile(raw: string | null): StoredProfile | null {
  try {
    const stored = JSON.parse(raw ?? "null") as StoredProfile | null;
    return stored?.version === ONBOARDING_VERSION ? stored : null;
  } catch {
    return null;
  }
}

export function readProfile(): StoredProfile | null {
  return parseStoredProfile(localStorage.getItem(PROFILE_KEY));
}

function write(stored: StoredProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(stored));
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
}

export function startSession() {
  document.cookie = `${ONBOARDING_COOKIE}=${ONBOARDING_VERSION}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
}

/** Saves answers, keeping the handle someone already has or handing out a new one. */
export function saveProfile(profile: Profile): StoredProfile {
  const previous = readProfile();
  const stored: StoredProfile = {
    version: ONBOARDING_VERSION,
    completedAt: previous?.completedAt ?? new Date().toISOString(),
    handle: validHandle(previous?.handle) ?? randomHandle(),
    profile,
  };
  write(stored);
  startSession();
  return stored;
}

function validHandle(handle: unknown): string | undefined {
  return typeof handle === "string" && HANDLE_PATTERN.test(handle)
    ? handle
    : undefined;
}

/** Profiles saved before handles existed get one the first time they are read. */
export function ensureHandle(): string | null {
  const stored = readProfile();
  if (!stored) return null;
  const handle = validHandle(stored.handle);
  if (handle) return handle;
  const next = { ...stored, handle: randomHandle() };
  write(next);
  return next.handle;
}

export function hasSession(): boolean {
  return document.cookie
    .split("; ")
    .includes(`${ONBOARDING_COOKIE}=${ONBOARDING_VERSION}`);
}

/** Ends the session; profile, board and history stay in this browser. */
export function logOut() {
  document.cookie = `${ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/x-ndjson" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads saved practice events and board moves as JSON Lines. A download is no proof of a
 * write, so records stay and export stays repeatable.
 */
export async function exportData(): Promise<{ events: number; moves: number }> {
  const store = await openPracticeStore();
  try {
    const events = await store.pending();
    const moves = boardPayloads(await store.workspaceRecords());
    if (events.length)
      download("muscle-memory-local-events.jsonl", encodePendingExport(events));
    if (moves.length)
      download("muscle-memory-board-activity.jsonl", moves.join("\n") + "\n");
    return { events: events.length, moves: moves.length };
  } finally {
    store.close();
  }
}

/** Board, saved practice and recorded activity. Profile, handle and settings stay. */
export async function resetProgress() {
  localStorage.removeItem(BOARD_KEY);
  window.dispatchEvent(new Event(BOARD_CHANGE));
  const store = await openPracticeStore();
  try {
    await store.clear();
  } finally {
    store.close();
  }
}

/** Everything this browser holds for the account, then the session. */
export async function deleteAccount() {
  await resetProgress();
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
  logOut();
}
