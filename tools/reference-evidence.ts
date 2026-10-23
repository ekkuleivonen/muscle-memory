/**
 * Capture-first synthetic example. Run twice: evidence commits before any parsing or
 * scoring, projections are a separate step, and retries deduplicate. Synthetic data only.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyCatalog } from "../packages/catalog/catalog";
import { startAttempt } from "../packages/catalog/gates";
import { captureSubmission } from "../packages/domain/evidence";
import { projectAssessment } from "../packages/domain/projection";
import { SqliteEvidenceStore } from "../packages/storage/evidence-sqlite";
import { exportPending } from "../packages/storage/export";
import { referenceSubmission } from "../packages/storage/reference-fixture";

// Original text as entered: irregular whitespace, and a malformed answer that cannot parse.
const SUBMISSIONS = [
  ' [{"a":2, "b":1},\n  {}, {"A":2,"a":1}, {"__proto__":2,"x":1}]\n',
  '[{"a": 2, "b": 1}, {},',
];

async function main() {
  const root = resolve(process.argv[2] ?? "private/reference");
  const archive = resolve(root, "evidence-exports");
  const catalog = verifyCatalog(
    JSON.parse(
      await readFile(resolve("content/catalog/reference.v1.json"), "utf8"),
    ),
  );
  const store = new SqliteEvidenceStore(resolve(root, "evidence.sqlite"));
  try {
    const captures = SUBMISSIONS.map((text, index) => {
      const input = referenceSubmission(
        text,
        "synthetic-participant-1",
        `synthetic-submission-${index + 1}`,
        index + 1,
      );
      // Only published content starts an attempt; capture itself never scores.
      startAttempt(
        catalog,
        input.adventure.id,
        input.adventure.version,
        input.encounter.position,
      );
      return store.capture(captureSubmission(input));
    });
    const capturedExports = await exportPending(store, archive);
    // Separate step: derive projections from the stored evidence, not from the input.
    const projections = captures.map(({ observationId }) => {
      const projection = projectAssessment(store.evidence(observationId));
      return {
        ...store.appendProjection(projection),
        outcome: projection.outcome.status,
      };
    });
    const projectionExports = await exportPending(store, archive);
    console.log(
      JSON.stringify(
        {
          captures,
          capturedExports,
          projections,
          projectionExports,
          dataDirectory: root,
          synthetic: true,
        },
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
