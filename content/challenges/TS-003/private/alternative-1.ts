/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  const fired: number[] = [];
  let scheduled: number | null = null;
  for (const time of keystrokes) {
    if (scheduled !== null && time > scheduled) fired.push(scheduled);
    scheduled = time + waitMs;
  }
  if (scheduled !== null) fired.push(scheduled);
  return fired;
}
