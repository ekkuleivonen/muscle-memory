/** A run's rows written to an outbox directory, for tools/model-runs/store_events.py. */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StoredRecord } from "../../packages/domain/records";
import { runNdjson } from "../../packages/model-runs/rows";

/**
 * Writes `<outbox>/<runId>.ndjson` through a temporary name, so the store job never reads half
 * a file.
 */
export async function writeOutbox(
  outbox: string,
  runId: string,
  records: readonly StoredRecord[],
  storedAt: string,
): Promise<string> {
  const text = runNdjson(records, storedAt);
  await mkdir(outbox, { recursive: true });
  const path = join(outbox, `${runId}.ndjson`);
  await writeFile(`${path}.partial`, text);
  await rename(`${path}.partial`, path);
  return path;
}
