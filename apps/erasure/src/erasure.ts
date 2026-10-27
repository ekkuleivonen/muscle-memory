/**
 * One erasure run (docs/telemetry.md#erasure): every participant with a deletion tombstone in
 * the control bucket loses their rows from the events table, and each erasure that removed
 * rows is recorded next to the tombstone. Runs over every tombstone, not only new ones, so
 * rows the pipeline was still holding when the request came are caught on a later run.
 *
 * Kept apart from index.ts, which needs the Workers runtime, so it can be tested under Node.
 */

/** The parts of an R2 bucket a run uses. */
export interface Bucket {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

/** Deletes these participants' rows; resolves to the rows removed per participant. */
export type Erase = (participantIds: string[]) => Promise<Record<string, number>>;

export interface RunResult {
  requests: number;
  rows: number;
  participants: number;
}

/** Participant IDs with a deletion tombstone, sorted. */
export async function tombstones(control: Bucket): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await control.list({ prefix: "deleted/", cursor });
    for (const { key } of page.objects) ids.push(key.slice("deleted/".length));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids.sort();
}

export async function run(control: Bucket, erase: Erase, now: Date): Promise<RunResult> {
  const ids = await tombstones(control);
  if (!ids.length) return { requests: 0, rows: 0, participants: 0 };
  const removed = await erase(ids);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  let rows = 0;
  let participants = 0;
  for (const [participant, count] of Object.entries(removed)) {
    if (!(count > 0)) continue;
    rows += count;
    participants += 1;
    await control.put(
      `erased/${participant}/${stamp}.json`,
      JSON.stringify({ erasedAt: now.toISOString(), rows: count }),
      { httpMetadata: { contentType: "application/json" } },
    );
  }
  return { requests: ids.length, rows, participants };
}
