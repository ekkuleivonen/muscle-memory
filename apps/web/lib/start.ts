/**
 * Where a challenge was started from, handed to practice: the picker (with its search and the
 * position in the list), quick start, a shared link, the suggestion after completing one, or
 * practising again. Kept in this tab for the one navigation; practice takes it once.
 */
import type { StartedFrom } from "../../../packages/domain/practice";

const START_KEY = "muscle-memory.start";

export interface StartContext {
  readonly key: string;
  readonly from: Exclude<StartedFrom, "direct">;
  readonly query: string | null;
  readonly position: number | null;
}

export function noteStart(start: StartContext): void {
  try {
    sessionStorage.setItem(START_KEY, JSON.stringify(start));
  } catch {
    // Without storage the start reads as direct.
  }
}

/** The start noted for this challenge, if any; it is used once. */
export function takeStart(key: string): StartContext | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(START_KEY) ?? "null") as StartContext | null;
    sessionStorage.removeItem(START_KEY);
    return value && value.key === key ? value : null;
  } catch {
    return null;
  }
}
