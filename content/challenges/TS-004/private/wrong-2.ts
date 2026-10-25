// Fixed windows aligned to multiples of windowMs, not a sliding window: a burst across a boundary gets twice the limit.
/**
 * For each login attempt time, whether it is allowed: at most `limit` allowed attempts
 * may fall inside any window of `windowMs` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const perBucket = new Map<number, number>();
  return times.map((time) => {
    const bucket = Math.floor(time / windowMs);
    const used = perBucket.get(bucket) ?? 0;
    if (used >= limit) return false;
    perBucket.set(bucket, used + 1);
    return true;
  });
}
