/**
 * The account as it exists so far: a profile and handle in this browser's storage, and a
 * cookie that stands in for a session. Browser-only; the server sees just the cookie.
 */
import { openPracticeStore } from "../../../packages/browser/practice-store";
import { BOARD_CHANGE, BOARD_KEY } from "./board";
import { HANDLE_PATTERN, randomHandle } from "./handle";
import { LEGAL_VERSION, type Acceptance } from "./legal";
import {
  ONBOARDING_COOKIE,
  ONBOARDING_VERSION,
  PROFILE_KEY,
  SESSION_VALUE,
  type Profile,
  type StoredProfile,
} from "./onboarding";

/** Same-tab change notice; other tabs hear the storage event. */
export const ACCOUNT_CHANGE = "muscle-memory:account";
const YEAR_SECONDS = 60 * 60 * 24 * 365;
/** Opt-in consent from before the Terms covered board moves; deleted with the account. */
const LEGACY_ACTIVITY_KEY = "muscle-memory.activity-log";

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
  document.cookie = `${ONBOARDING_COOKIE}=${SESSION_VALUE}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
}

/** Accepting the current Terms and Privacy Notice, now. */
export function acceptance(): Acceptance {
  return { version: LEGAL_VERSION, at: new Date().toISOString() };
}

/**
 * Saves answers, keeping the handle someone already has or handing out a new one, and the
 * latest acceptance: `accepted` when given, otherwise the one on file.
 */
export function saveProfile(
  profile: Profile,
  accepted?: Acceptance,
): StoredProfile {
  const previous = readProfile();
  const stored: StoredProfile = {
    ...previous,
    version: ONBOARDING_VERSION,
    completedAt: previous?.completedAt ?? new Date().toISOString(),
    handle: validHandle(previous?.handle) ?? randomHandle(),
    accepted: accepted ?? previous?.accepted,
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
    .includes(`${ONBOARDING_COOKIE}=${SESSION_VALUE}`);
}

/** Records acceptance of the current Terms on an existing account. */
export function acceptTerms() {
  const stored = readProfile();
  if (stored) write({ ...stored, accepted: acceptance() });
}

export function setExcludeFromPublishedData(exclude: boolean) {
  const stored = readProfile();
  if (stored) write({ ...stored, excludeFromPublishedData: exclude });
}

/** Ends the session; profile, board and history stay in this browser. */
export function logOut() {
  document.cookie = `${ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
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
  localStorage.removeItem(LEGACY_ACTIVITY_KEY);
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
  logOut();
}
