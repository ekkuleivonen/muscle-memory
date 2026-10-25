/** The real catalog, for tests: verified like the app verifies it. */
import { readFileSync } from "node:fs";
import type { Revision } from "../../../packages/content/model";
import { verifyCatalog } from "../../../packages/content/revision";

export const catalog = verifyCatalog(
  JSON.parse(
    readFileSync(new URL("../../../content/catalog.json", import.meta.url), "utf8"),
  ),
);

/** A challenge's live revision and its id, by key. */
export function live(key: string): { id: string; revision: Revision } {
  const meta = catalog.challenges.find((c) => c.key === key);
  if (!meta) throw new Error(`No challenge ${key} in the catalog.`);
  return { id: meta.revision, revision: catalog.revisions[meta.revision] };
}
