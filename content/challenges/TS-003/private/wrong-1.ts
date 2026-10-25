// Times each request from the first keystroke of a burst, not the last: that is throttling, not debouncing.
/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  return keystrokes
    .filter((time, i) => i === 0 || time - keystrokes[i - 1] > waitMs)
    .map((time) => time + waitMs);
}
