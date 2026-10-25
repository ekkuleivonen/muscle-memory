// Measures the pause from the burst's first keystroke, so steady typing still fires mid-burst.
/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  const fired: number[] = [];
  let burstStart: number | null = null;
  let last = 0;
  for (const time of keystrokes) {
    if (burstStart !== null && time - burstStart > waitMs) {
      fired.push(last + waitMs);
      burstStart = time;
    }
    if (burstStart === null) burstStart = time;
    last = time;
  }
  if (burstStart !== null) fired.push(last + waitMs);
  return fired;
}
