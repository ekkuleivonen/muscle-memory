/**
 * The profile shared by the server gate and the browser. Answers stay in localStorage; the
 * consent cookie carries only the Terms version, so the server can redirect without seeing them.
 */
import type { LanguageId } from "./languages";
import { LEGAL_VERSION, type Acceptance } from "./legal";

/** Bump when the stored shape changes; older profiles then read as none. */
export const PROFILE_VERSION = "2";
export const PROFILE_KEY = "muscle-memory.profile";
/**
 * Accepting the current Terms is the only thing any page requires: one click on /consent or
 * /play. This cookie says it was done; the profile questions are asked in the app, never required.
 */
export const CONSENT_COOKIE = "mm_consent";
export const CONSENT_VALUE = LEGAL_VERSION;

export interface Profile {
  experience?: "new" | "some" | "professional" | "veteran";
  /** How often they code with AI help, in their own words: the context for everything else. */
  aiUse?: "daily" | "weekly" | "rarely" | "never";
  languages?: LanguageId[];
  goal?: "sharp" | "learn" | "interview" | "fun";
  editor?: "standard" | "vim";
}

/** One profile question's history on this device: answered by the person, or put off. */
export interface Asked {
  /** When the person answered it themselves (not a guess, like the five-minute test's language). */
  answeredAt?: string;
  /** "Not now": not asked again anywhere until then. */
  snoozedUntil?: string;
}

export interface StoredProfile {
  version: string;
  /** When this browser first accepted the Terms. */
  createdAt: string;
  /** Anonymous, handed out rather than chosen: Quiet-Compiler-4821. */
  handle?: string;
  /** The Terms and Privacy Notice version accepted, and when. */
  accepted?: Acceptance;
  /**
   * Stealth, the opt-out in settings: left out of published datasets and of comparisons, and
   * in return shown no one else's stats.
   */
  stealth?: boolean;
  /** Logged out in settings: the consent page asks again instead of signing back in silently. */
  signedOut?: true;
  /** Which questions were answered or put off, by question id. */
  asked?: Partial<Record<keyof Profile, Asked>>;
  profile: Profile;
}

/** Accepted the current Terms, at /consent or /play. */
export function hasConsent(consent: string | undefined): boolean {
  return consent === CONSENT_VALUE;
}

/**
 * Where to go after /consent: a same-site path only, never another origin and never back to
 * /consent itself. Anything else falls back to `fallback`.
 */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const base = "https://muscle-memory.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname.startsWith("/consent")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/**
 * Whether a question is still worth asking: unanswered and not put off. The languages answer
 * counts only once the person gives it; the five-minute test's language is a guess that seeds
 * it, not an answer.
 */
export function isOpen(stored: StoredProfile, id: keyof Profile, now = Date.now()): boolean {
  const asked = stored.asked?.[id];
  if (asked?.snoozedUntil && Date.parse(asked.snoozedUntil) > now) return false;
  if (id === "languages") return !asked?.answeredAt;
  return stored.profile[id] === undefined;
}
