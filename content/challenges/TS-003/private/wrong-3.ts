// A keystroke exactly waitMs after the last one is treated as too late: it should still cancel the pending request.
/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  return keystrokes
    .filter((time, i) => i === keystrokes.length - 1 || keystrokes[i + 1] - time >= waitMs)
    .map((time) => time + waitMs);
}
