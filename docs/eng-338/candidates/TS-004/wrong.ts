/**
 * For each login attempt time, whether it is allowed: at most `limit` allowed attempts
 * may fall inside any window of `windowMs` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const accepted: number[] = [];
  let start = 0;
  return times.map((time) => {
    while (start < accepted.length && accepted[start] <= time - windowMs) start++;
    const allowed = accepted.length - start < limit;
    accepted.push(time);
    return allowed;
  });
}
