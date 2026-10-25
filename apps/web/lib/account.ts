/**
 * The account as it exists so far: a profile and handle in this browser's storage, and a
 * cookie that stands in for a session. Browser-only; the server sees just the cookie.
 */
import { openPracticeStore } from "../../../packages/browser/practice-store";
import { eraseUploaded } from "./ingest";
import { PROGRESS_CHANGE, PROGRESS_KEY } from "./progress";
import { HANDLE_PATTERN, randomHandle } from "./handle";
import type { LanguageId } from "./languages";
import { LEGAL_VERSION, type Acceptance } from "./legal";
import { STARS_KEY } from "./stars";
import {
  CONSENT_COOKIE,
  CONSENT_VALUE,
  PROFILE_KEY,
  PROFILE_VERSION,
  type Profile,
  type StoredProfile,
} from "./profile";

/** Same-tab change notice; other tabs hear the storage event. */
export const ACCOUNT_CHANGE = "muscle-memory:account";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseStoredProfile(raw: string | null): StoredProfile | null {
  try {
    const stored = JSON.parse(raw ?? "null") as StoredProfile | null;
    return stored?.version === PROFILE_VERSION ? stored : null;
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

/** Accepting the current Terms and Privacy Notice, now. */
export function acceptance(): Acceptance {
  return { version: LEGAL_VERSION, at: new Date().toISOString() };
}

/**
 * The whole profile from settings, every question in it answered by the person. Keeps the
 * handle, the acceptance and everything else on file.
 */
export function saveProfile(profile: Profile): StoredProfile | null {
  const stored = readProfile();
  if (!stored) return null;
  const at = new Date().toISOString();
  const asked = { ...stored.asked };
  for (const id of Object.keys(profile) as (keyof Profile)[]) asked[id] = { answeredAt: at };
  const next = { ...stored, profile, asked };
  write(next);
  return next;
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

/**
 * Accept the current Terms (/consent, /start): the only thing any page needs. Keeps whatever
 * this browser already has and signs it back in; a newcomer gets a handle and an empty profile,
 * which the app's questions fill in as they go. Opens every page.
 */
export function acceptConsent(): StoredProfile {
  const previous = readProfile();
  const { signedOut: _, ...kept } = previous ?? ({} as Partial<StoredProfile>);
  const stored: StoredProfile = previous
    ? { ...(kept as StoredProfile), accepted: acceptance() }
    : {
        version: PROFILE_VERSION,
        createdAt: new Date().toISOString(),
        handle: randomHandle(),
        accepted: acceptance(),
        profile: {},
      };
  write(stored);
  document.cookie = `${CONSENT_COOKIE}=${CONSENT_VALUE}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
  return stored;
}

/**
 * The language picked in quick start, as a first guess at the languages answer: saved
 * when the profile has none yet, so every IDE session's profile snapshot carries it. The
 * languages question still counts as open until the person answers it. Returns the profile.
 */
export function guessLanguage(language: LanguageId): Profile {
  const stored = readProfile();
  if (!stored) return { languages: [language] };
  if (stored.profile.languages?.length) return stored.profile;
  const profile = { ...stored.profile, languages: [language] };
  write({ ...stored, profile });
  return profile;
}

export function setStealth(stealth: boolean) {
  const stored = readProfile();
  if (stored) write({ ...stored, stealth });
}

/**
 * Ends the session; profile, progress and history stay in this browser, and the consent page
 * offers to sign back in rather than doing it silently.
 */
export function logOut() {
  const stored = readProfile();
  if (stored) write({ ...stored, signedOut: true });
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Progress, saved practice and recorded activity on this device. Profile, handle, settings and
 * the device identity stay, so anything already uploaded can still be deleted later.
 */
export async function resetProgress(identity = false) {
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem("muscle-memory.workspace-view");
  window.dispatchEvent(new Event(PROGRESS_CHANGE));
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
  localStorage.removeItem(STARS_KEY);
  window.dispatchEvent(new Event(ACCOUNT_CHANGE));
  logOut();
}
