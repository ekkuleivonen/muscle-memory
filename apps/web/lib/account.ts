/**
 * The account as it exists so far: a profile and handle in this browser's storage, and a
 * cookie that stands in for a session. Browser-only; the server sees just the cookie.
 */
import { openPracticeStore } from "../../../packages/browser/practice-store";
import { eraseUploaded } from "./ingest";
import { BOARD_CHANGE, BOARD_KEY } from "./board";
import { HANDLE_PATTERN, randomHandle } from "./handle";
import type { LanguageId } from "./languages";
import { LEGAL_VERSION, type Acceptance } from "./legal";
import {
  ONBOARDING_COOKIE,
  PLAY_COOKIE,
  PLAY_VALUE,
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
  const { playOnly: _, ...earlier } = previous ?? {};
  const stored: StoredProfile = {
    ...(earlier as Partial<StoredProfile>),
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

/**
 * The five-minute test: accept the current Terms and nothing else. Keeps whatever this
 * browser already has; a newcomer gets a handle and an empty profile marked play-only, which
 * onboarding finishes later. Opens the IDE and pull requests, not the platform.
 */
export function acceptForPlay(): StoredProfile {
  const previous = readProfile();
  const stored: StoredProfile = previous
    ? { ...previous, accepted: acceptance() }
    : {
        version: ONBOARDING_VERSION,
        completedAt: new Date().toISOString(),
        handle: randomHandle(),
        accepted: acceptance(),
        playOnly: true,
        profile: {},
      };
  write(stored);
  document.cookie = `${PLAY_COOKIE}=${PLAY_VALUE}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
  return stored;
}

/**
 * The language picked for the five-minute test, as the languages answer: saved when the
 * profile has none yet, so every IDE session's profile snapshot carries it and onboarding
 * starts from it. Returns the profile as it now stands.
 */
export function playLanguage(language: LanguageId): Profile {
  const stored = readProfile();
  if (!stored) return { languages: [language] };
  if (stored.profile.languages?.length) return stored.profile;
  const profile = { ...stored.profile, languages: [language] };
  write({ ...stored, profile });
  return profile;
}

/** Records acceptance of the current Terms on an existing account. */
export function acceptTerms() {
  const stored = readProfile();
  if (stored) write({ ...stored, accepted: acceptance() });
}

export function setStealth(stealth: boolean) {
  const stored = readProfile();
  if (stored) write({ ...stored, stealth });
}

/** Ends the session; profile, board and history stay in this browser. */
export function logOut() {
  document.cookie = `${ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${PLAY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Board, saved practice and recorded activity on this device. Profile, handle, settings and
 * the device identity stay, so anything already uploaded can still be deleted later.
 */
export async function resetProgress(identity = false) {
  localStorage.removeItem(BOARD_KEY);
  window.dispatchEvent(new Event(BOARD_CHANGE));
  const store = await openPracticeStore();
  try {
    await store.clear(identity);
  } finally {
    store.close();
  }
}

/**
 * Everything: uploaded records first (with the device secret as proof), then everything this
 * browser holds, then the session. If the server cannot be reached, nothing is deleted, since
 * forgetting the secret would leave the uploaded records undeletable.
 */
export async function deleteAccount() {
  const store = await openPracticeStore();
  try {
    await eraseUploaded(store);
  } finally {
    store.close();
  }
  await resetProgress(true);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LEGACY_ACTIVITY_KEY);
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
  logOut();
}
