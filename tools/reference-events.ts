import { readFile } from "node:fs/promises";
import { verifyCatalog } from "../packages/catalog/catalog";
import { startAttempt, assessAttempt } from "../packages/catalog/gates";
/** Run twice to demonstrate durable deduplication and retryable export. Synthetic data only. */
import { resolve } from "node:path";
import { SqliteEventStore } from "../packages/storage/sqlite";
import { exportPending } from "../packages/storage/export";
import { referenceEvent } from "../packages/storage/reference-fixture";

async function main() {
  const root = resolve(process.argv[2] ?? "private/reference");
  const store = new SqliteEventStore(resolve(root, "events.sqlite"));
  try {
    const event = referenceEvent();
    const catalog = verifyCatalog(
      JSON.parse(
        await readFile(resolve("content/catalog/reference.v1.json"), "utf8"),
      ),
    );
    startAttempt(
      catalog,
      event.attempt.encounter.adventureId,
      event.attempt.encounter.adventureVersion,
      event.attempt.encounter.position,
    );
    assessAttempt(catalog, event.attempt);
    const receipt = store.append(event);
    const exported = await exportPending(store, resolve(root, "exports"));
    console.log(
      JSON.stringify(
        { ...receipt, exported, dataDirectory: root, synthetic: true },
        null,
        2,
      ),
    );
  } finally {
    store.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
