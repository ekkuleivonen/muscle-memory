// Counts rejected attempts toward the limit too.
/**
 * For each login attempt time, whether it is allowed: at most `limit` allowed attempts
 * may fall inside any window of `windowMs` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const recent: number[] = [];
  return times.map((time) => {
    while (recent.length > 0 && recent[0] <= time - windowMs) recent.shift();
    const allowed = recent.length < limit;
    recent.push(time);
    return allowed;
  });
}
