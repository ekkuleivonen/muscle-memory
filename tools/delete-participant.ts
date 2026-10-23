/** Delete one synthetic participant's local events and owned archive files. Safe to rerun. */
import { resolve } from "node:path";
import { SqliteEventStore } from "../packages/storage/sqlite";
import { deleteParticipant } from "../packages/storage/deletion";

async function main() {
  const [participantId, directory = "private/reference"] =
    process.argv.slice(2);
  if (!participantId)
    throw new Error(
      "Usage: npm run delete:participant -- <participant-id> [data-directory]",
    );
  const root = resolve(directory);
  const store = new SqliteEventStore(resolve(root, "events.sqlite"));
  try {
    const result = await deleteParticipant(
      store,
      participantId,
      resolve(root, "exports"),
    );
    console.log(JSON.stringify({ ...result, dataDirectory: root }, null, 2));
    // Incomplete deletion is a failure: rerun after fixing the reported errors.
    if (!result.complete) process.exitCode = 1;
  } finally {
    store.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
