import type { Catalog } from "../../../packages/content/model";
/** Published metadata only. No private solutions, player data, or invented job status. */
export function adminInventory(catalog: Catalog) {
  return catalog.challenges.map((c) => ({
    key: c.key,
    title: c.title,
    revision: c.revision,
    language: catalog.revisions[c.revision].language,
    status: "published" as const,
    benchmark: "unavailable" as const,
  }));
}
