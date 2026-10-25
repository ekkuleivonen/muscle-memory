/**
 * Starred challenges: a list of keys kept in this browser, for finding them again. A preference,
 * not practice, so nothing is recorded; backups carry it like any muscle-memory.* entry, reset
 * keeps it and deleting the account removes it.
 */
export const STARS_KEY = "muscle-memory.stars";
export const STARS_CHANGE = "muscle-memory:stars";

/** Stored stars, tolerating anything malformed as none. */
export function parseStars(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === "string"))]
      : [];
  } catch {
    return [];
  }
}

/** The stars with `key` switched on or off. */
export function toggleStar(stars: readonly string[], key: string): string[] {
  return stars.includes(key) ? stars.filter((k) => k !== key) : [...stars, key];
}

export function writeStars(stars: readonly string[]) {
  localStorage.setItem(STARS_KEY, JSON.stringify(stars));
  window.dispatchEvent(new Event(STARS_CHANGE));
}
