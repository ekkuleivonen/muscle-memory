/** Trusted scheduled-build input from immutable publication storage; no private content escapes. */
import type {
  CatalogDatabase,
  ContentBucket,
  Version,
} from "../authoring/storage";
import { verifyCatalog } from "../content/revision";
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import { engineFor } from "../runner/engines";
import { cohortWindow } from "./cohort-window";
import { syntheticRevisions } from "./exclusions";

export async function readCohortBuildSpec(
  db: CatalogDatabase,
  content: Pick<ContentBucket, "get">,
  challenge: string,
  revision: string,
  now = new Date(),
) {
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("Invalid cohort revision.");
  const row = await db
    .prepare(
      `SELECT v.* FROM published_versions v
    JOIN challenge_heads h ON h.challenge_key = v.challenge_key
      AND h.published_revision = v.revision
    WHERE v.challenge_key = ? AND v.revision = ? AND h.lifecycle = 'published'`,
    )
    .bind(challenge, revision)
    .first<Version>();
  if (!row) return null;
  if (row.challenge_key !== challenge || row.revision !== revision)
    throw new Error("Invalid cohort publication.");
  if (syntheticRevisions([row]).length) return null;
  const object = await content.get(row.object_key);
  if (!object) return null;
  // Same catalog/hash validation as the managed authoring reader. Published display metadata
  // intentionally has no language: only the immutable revision can establish it.
  const catalog = verifyCatalog({
    schemaVersion: "1.0.0",
    challenges: [JSON.parse(row.metadata_json)],
    revisions: { [revision]: JSON.parse(await object.text()) },
  });
  if (
    catalog.challenges[0].key !== challenge ||
    catalog.challenges[0].revision !== revision
  )
    throw new Error("Invalid cohort publication.");
  const runtime = engineFor(catalog.revisions[revision].language)?.runtime;
  if (!runtime) return null;
  return {
    challenge,
    revision,
    window: cohortWindow(row.published_at, now),
    runtime,
  };
}
