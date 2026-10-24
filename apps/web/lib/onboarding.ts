/**
 * Onboarding state shared by the server gate and the browser. Answers stay in localStorage;
 * the cookie carries only the setup version, so the server can redirect without seeing them.
 */
import type { LanguageId } from "./languages";
import { LEGAL_VERSION, type Acceptance } from "./legal";

export const ONBOARDING_COOKIE = "mm_setup";
/** Bump when the questions change enough that everyone should answer again. */
export const ONBOARDING_VERSION = "1";
/**
 * The cookie value for a signed-in browser: setup done and the current Terms accepted. A new
 * setup or legal version changes it, so the server sends everyone back to onboarding once.
 */
export const SESSION_VALUE = `${ONBOARDING_VERSION}.${LEGAL_VERSION}`;
export const PROFILE_KEY = "muscle-memory.profile";
/**
 * The five-minute test (/play) asks only for the Terms. This cookie says they were accepted,
 * which opens the IDE and pull requests but not the rest of the platform: that still goes
 * through onboarding, which then asks only the questions.
 */
export const PLAY_COOKIE = "mm_play";
export const PLAY_VALUE = LEGAL_VERSION;

export interface Profile {
  experience?: "new" | "some" | "professional" | "veteran";
  /** How often they code with AI help, in their own words: the context for everything else. */
  aiUse?: "daily" | "weekly" | "rarely" | "never";
  languages?: LanguageId[];
  goal?: "sharp" | "learn" | "interview" | "fun";
  editor?: "standard" | "vim";
}

export interface StoredProfile {
  version: string;
  completedAt: string;
  /** Anonymous, handed out rather than chosen: Quiet-Compiler-4821. */
  handle?: string;
  /** The Terms and Privacy Notice version accepted, and when. */
  accepted?: Acceptance;
  /**
   * Stealth, the opt-out in settings: left out of published datasets and of comparisons, and
   * in return shown no one else's stats.
   */
  stealth?: boolean;
  /** Accepted the Terms for the five-minute test but has not answered the setup questions. */
  playOnly?: true;
  profile: Profile;
}

export function isOnboarded(cookieValue: string | undefined): boolean {
  return cookieValue === SESSION_VALUE;
}

/** Onboarded, or at least accepted the current Terms through the five-minute test. */
export function hasConsent(setup: string | undefined, play: string | undefined): boolean {
  return isOnboarded(setup) || play === PLAY_VALUE;
}

/**
 * Where to go after onboarding: a same-site path only, never another origin and never back
 * to onboarding itself. Anything else falls back to `fallback`.
 */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const base = "https://muscle-memory.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname.startsWith("/onboarding"))
      return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/**
 * Where onboarding should continue to: the page someone was heading for, unless that was the
 * dashboard (the default destination anyway) or the public home page. Null means the dashboard.
 */
export function returnPath(value: unknown): string | null {
  const path = safeNext(value, "/dashboard");
  return path === "/dashboard" || path === "/" ? null : path;
}

/** The issue list filtered to the languages someone chose, or unfiltered. */
export function issuesFor(profile: Profile): string {
  const languages = profile.languages ?? [];
  return languages.length
    ? `/issues?${new URLSearchParams({ q: `lang:${languages.join(",")}` })}`
    : "/issues";
}

/** Rebuilds a page's own path and query, for the onboarding return link. */
export function pathWithQuery(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const v of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      search.append(key, v);
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
