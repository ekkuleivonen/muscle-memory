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
 * /start. This cookie says it was done; the profile questions are asked in the app, never required.
 */
export const CONSENT_COOKIE = "mm_consent";
export const CONSENT_VALUE = LEGAL_VERSION;

/**
 * Self-reported, every answer optional (lib/questions.ts asks them). Categories, never free
 * text, so groups compare and nobody is singled out.
 */
export interface Profile {
  experience?: "new" | "some" | "professional" | "veteran";
  /** What they do: the kind of code they write most. */
  role?: "student" | "software" | "data" | "infra" | "qa" | "manager" | "other";
  /** How they mostly learned to code. */
  learned?: "degree" | "bootcamp" | "self-taught" | "on-the-job";
  /** Where they write code most. */
  context?:
    | "company"
    | "startup"
    | "freelance"
    | "open-source"
    | "school"
    | "hobby";
  languages?: LanguageId[];
  /** How often they code with AI help, in their own words: the context for everything else. */
  aiUse?: "daily" | "weekly" | "rarely" | "never";
  /** What they use AI for when coding; "none" alone when nothing. */
  aiTools?: ("completion" | "chat" | "agents" | "review" | "none")[];
  /** About how much of the code they ship an AI wrote. */
  aiShare?: "none" | "some" | "half" | "most" | "nearly-all";
  goal?: "sharp" | "learn" | "interview" | "fun";
  /** Whether they type without looking at the keys: keystroke timing depends on it. */
  touchTyping?: "yes" | "mostly" | "no";
  /** An age band, never a birth date. */
  age?: "16-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55+";
  editor?: "standard" | "vim";
}

/** One profile question's history on this device. */
export interface Asked {
  /** When the person answered it themselves (not a guess, like quick start's language). */
  answeredAt?: string;
}

export interface StoredProfile {
  version: string;
  /** When this browser first accepted the Terms. */
  createdAt: string;
  /** The Terms and Privacy Notice version accepted, and when. */
  accepted?: Acceptance;
  /**
   * Stealth, the opt-out in settings: left out of published insights and of comparisons, and
   * in return shown no one else's stats.
   */
  stealth?: boolean;
  /** Logged out in settings: the consent page asks again instead of signing back in silently. */
  signedOut?: true;
  /** Which questions the person answered themselves, by question id. */
  asked?: Partial<Record<keyof Profile, Asked>>;
  profile: Profile;
}

/** Accepted the current Terms, at /consent or /start. */
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
    if (url.origin !== base || url.pathname.startsWith("/consent"))
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** Apply only questions explicitly changed in this form; clearing also removes answer provenance. */
export function updateProfileAnswers(
  stored: StoredProfile,
  answers: Profile,
  changed: readonly (keyof Profile)[],
  at: string,
): StoredProfile {
  const profile = { ...stored.profile };
  const asked = { ...stored.asked };
  for (const id of changed) {
    const value = answers[id];
    if (value === undefined || (Array.isArray(value) && !value.length)) {
      delete profile[id];
      delete asked[id];
    } else {
      Object.assign(profile, { [id]: value });
      asked[id] = { answeredAt: at };
    }
  }
  return { ...stored, profile, asked };
}

/** Profile values present without the person's own answer: guesses, never answers. */
export function guesses(stored: StoredProfile | null): Set<keyof Profile> {
  return new Set(
    (Object.keys(stored?.profile ?? {}) as (keyof Profile)[]).filter(
      (id) => !stored?.asked?.[id]?.answeredAt,
    ),
  );
}

/** A quick-start language guess must not become self-reported familiarity. */
export function reportProfile(stored: StoredProfile): Profile {
  const profile = { ...stored.profile };
  if (!stored.asked?.languages?.answeredAt) delete profile.languages;
  return profile;
}
