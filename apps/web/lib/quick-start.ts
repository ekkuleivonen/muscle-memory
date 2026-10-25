/**
 * Quick start: the challenge to begin with in a language, so someone new is given an easy one
 * at once. Easiest first, then by key, skipping what this device already completed; with all
 * of them completed, the easiest again. Pure, so it is testable.
 */
import type { Difficulty } from "../../../packages/content/model";

export interface Starter {
  readonly key: string;
  readonly language: string;
  readonly difficulty: Difficulty;
}

const LEVELS: readonly Difficulty[] = ["easy", "medium", "hard"];

export function quickStart<T extends Starter>(
  challenges: readonly T[],
  language: string,
  completed: (key: string) => boolean,
): T | null {
  const ordered = challenges
    .filter((c) => c.language === language)
    .sort(
      (a, b) =>
        LEVELS.indexOf(a.difficulty) - LEVELS.indexOf(b.difficulty) ||
        a.key.localeCompare(b.key, "en", { numeric: true }),
    );
  return ordered.find((c) => !completed(c.key)) ?? ordered[0] ?? null;
}
