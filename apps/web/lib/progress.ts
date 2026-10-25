/**
 * Progress on this device, per challenge: the attempt under way (or the last one), when it
 * started, and whether and how often the challenge was completed. Practice keeps it; the picker's
 * ✔ and repeat attempts read it. Recorded data says the same (practice.started and
 * practice.completed); this is what lets the device know it after those records were uploaded
 * and compacted away.
 */
import { CHALLENGE_KEY } from "../../../packages/domain/records";

export const PROGRESS_KEY = "muscle-memory.progress";
/** Same-tab change notice; other tabs hear the storage event. */
export const PROGRESS_CHANGE = "muscle-memory:progress";

export interface ChallengeProgress {
  /** The current, or last, attempt. */
  readonly attempt: string;
  readonly startedAt: string;
  /** When the current attempt was completed, or null while it is under way. */
  readonly completedAt: string | null;
  /** Attempts completed, this one included. */
  readonly completions: number;
}

/** By challenge key, such as PY-003. */
export type Progress = Readonly<Record<string, ChallengeProgress>>;

const ATTEMPT = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

/** Reads stored progress, dropping anything malformed rather than failing. */
export function parseProgress(raw: string | null): Progress {
  try {
    const value = JSON.parse(raw ?? "{}") as Record<string, Partial<ChallengeProgress>>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, p]) =>
        p &&
        CHALLENGE_KEY.test(key) &&
        typeof p.attempt === "string" &&
        ATTEMPT.test(p.attempt) &&
        typeof p.startedAt === "string" &&
        (p.completedAt === null || typeof p.completedAt === "string") &&
        Number.isSafeInteger(p.completions) &&
        p.completions! >= 0
          ? [[key, p as ChallengeProgress]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

/** Whether the challenge with this key was ever completed on this device. */
export function completed(progress: Progress, key: string): boolean {
  return (progress[key]?.completions ?? 0) > 0;
}

/**
 * The attempt practice works in. Opening resumes the attempt there is; a start (from the picker,
 * quick start, a link or a suggestion) after the last attempt completed begins a new one, as
 * does the very first open. `fresh` says a new attempt began, which is recorded as `started`.
 */
export function attemptFor(
  progress: Progress,
  key: string,
  start: boolean,
  now: string,
  newId: () => string,
): { progress: Progress; attempt: string; fresh: boolean } {
  const current = progress[key];
  if (current && !(start && current.completedAt))
    return { progress, attempt: current.attempt, fresh: false };
  const attempt = newId();
  return {
    progress: {
      ...progress,
      [key]: {
        attempt,
        startedAt: now,
        completedAt: null,
        completions: current?.completions ?? 0,
      },
    },
    attempt,
    fresh: true,
  };
}

/** The attempt completed: once, however many times it is reported. */
export function complete(progress: Progress, key: string, attempt: string, at: string): Progress {
  const current = progress[key];
  if (!current || current.attempt !== attempt || current.completedAt) return progress;
  return {
    ...progress,
    [key]: { ...current, completedAt: at, completions: current.completions + 1 },
  };
}

export function readProgress(): Progress {
  return parseProgress(localStorage.getItem(PROGRESS_KEY));
}

export function writeProgress(progress: Progress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  window.dispatchEvent(new Event(PROGRESS_CHANGE));
}
