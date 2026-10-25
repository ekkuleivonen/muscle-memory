// Keeps an attempt exactly windowMs old in the window, which should already have left it.
/**
 * For each login attempt time, whether it is allowed: at most `limit` allowed attempts
 * may fall inside any window of `windowMs` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const recent: number[] = [];
  return times.map((time) => {
    while (recent.length > 0 && recent[0] < time - windowMs) recent.shift();
    if (recent.length >= limit) return false;
    recent.push(time);
    return true;
  });
}
