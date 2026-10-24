/** Delete one synthetic participant's local records and owned archive files from both stores. Safe to rerun. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SqliteEventStore } from "../packages/storage/sqlite";
import { SqliteEvidenceStore } from "../packages/storage/evidence-sqlite";
import { deleteParticipant } from "../packages/storage/deletion";

const STORES = [
  {
    name: "attempt.assessed",
    database: "events.sqlite",
    archive: "exports",
    open: (path: string) => new SqliteEventStore(path),
  },
  {
    name: "evidence",
    database: "evidence.sqlite",
    archive: "evidence-exports",
    open: (path: string) => new SqliteEvidenceStore(path),
  },
];

async function main() {
  const [participantId, directory = "private/reference"] =
    process.argv.slice(2);
  if (!participantId)
    throw new Error(
      "Usage: npm run delete:participant -- <participant-id> [data-directory]",
    );
  const root = resolve(directory);
  const results = [];
  for (const { name, database, archive, open } of STORES) {
    const path = resolve(root, database);
    // An absent store holds nothing to delete; do not create one.
    if (!existsSync(path)) continue;
    const store = open(path);
    try {
      const result = await deleteParticipant(
        store,
        participantId,
        resolve(root, archive),
      );
      results.push({ store: name, ...result });
    } finally {
      store.close();
    }
  }
  const complete = results.every((result) => result.complete);
  console.log(
    JSON.stringify({ complete, results, dataDirectory: root }, null, 2),
  );
  // Incomplete deletion is a failure: rerun after fixing the reported errors.
  if (!complete) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
