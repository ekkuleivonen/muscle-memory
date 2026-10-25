/**
 * React views of what this device keeps: progress, stars, and whether the page has hydrated.
 * Each re-reads its storage when it changes, in this tab or another.
 */
import { useMemo, useSyncExternalStore } from "react";
import { parseStars, STARS_CHANGE, STARS_KEY } from "./stars";
import { parseProgress, PROGRESS_CHANGE, PROGRESS_KEY, type Progress } from "./progress";

function subscribeTo(event: string) {
  return (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(event, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(event, onChange);
    };
  };
}
const progressEvents = subscribeTo(PROGRESS_CHANGE);
const starEvents = subscribeTo(STARS_CHANGE);
const noSubscription = () => () => {};

/** False during the server render and hydration, true after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

export function useProgress(): Progress {
  const raw = useSyncExternalStore(
    progressEvents,
    () => localStorage.getItem(PROGRESS_KEY),
    () => null,
  );
  return useMemo(() => parseProgress(raw), [raw]);
}

/** Starred keys on this device. */
export function useStars(): string[] {
  const raw = useSyncExternalStore(
    starEvents,
    () => localStorage.getItem(STARS_KEY),
    () => null,
  );
  return useMemo(() => parseStars(raw), [raw]);
}
