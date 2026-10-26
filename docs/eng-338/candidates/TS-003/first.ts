/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  const fires: number[] = [];
  let scheduled: number | undefined;
  for (const time of keystrokes) {
    if (scheduled !== undefined && time > scheduled) fires.push(scheduled);
    scheduled = time + waitMs;
  }
  if (scheduled !== undefined) fires.push(scheduled);
  return fires;
}
