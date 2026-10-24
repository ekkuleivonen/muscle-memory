/**
 * Onboarding state shared by the server gate and the browser. Answers stay in localStorage;
 * the cookie carries only the setup version, so the server can redirect without seeing them.
 */
import type { LanguageId } from "./languages";

export const ONBOARDING_COOKIE = "mm_setup";
/** Bump when the questions change enough that everyone should answer again. */
export const ONBOARDING_VERSION = "1";
export const PROFILE_KEY = "muscle-memory.profile";

export interface Profile {
  experience?: "new" | "some" | "professional" | "veteran";
  languages?: LanguageId[];
  goal?: "sharp" | "learn" | "interview" | "fun";
  editor?: "standard" | "vim";
}

export interface StoredProfile {
  version: string;
  completedAt: string;
  profile: Profile;
}

export function isOnboarded(cookieValue: string | undefined): boolean {
  return cookieValue === ONBOARDING_VERSION;
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
 * Where onboarding should continue to: the page someone was heading for, unless that was
 * home (the default destination anyway). Null means home.
 */
export function returnPath(value: unknown): string | null {
  const path = safeNext(value, "/");
  return path === "/" ? null : path;
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
