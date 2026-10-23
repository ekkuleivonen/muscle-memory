/** Run twice to demonstrate durable deduplication and retryable export. Synthetic data only. */
import { resolve } from "node:path";
import { SqliteEventStore } from "../packages/storage/sqlite";
import { exportPending } from "../packages/storage/export";
import { referenceEvent } from "../packages/storage/reference-fixture";

async function main() {
  const root = resolve(process.argv[2] ?? "private/reference");
  const store = new SqliteEventStore(resolve(root, "events.sqlite"));
  try {
    const receipt = store.append(referenceEvent());
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
