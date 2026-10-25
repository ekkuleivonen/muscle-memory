/**
 * For each login attempt time, whether it is allowed: at most `limit` allowed attempts
 * may fall inside any window of `windowMs` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const allowed: number[] = [];
  let oldest = 0;
  return times.map((time) => {
    while (oldest < allowed.length && allowed[oldest] <= time - windowMs) oldest++;
    const ok = allowed.length - oldest < limit;
    if (ok) allowed.push(time);
    return ok;
  });
}
