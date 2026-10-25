import { verifyCatalog } from "../../../packages/content/revision";
import type { Catalog } from "../../../packages/content/model";
import catalog from "../../../content/catalog.json";

/**
 * The catalog the app serves: every challenge's metadata and its live revision. Built from
 * content/challenges by tools/build-content.ts before dev, builds and tests; it moves to object
 * storage once the admin system exists.
 */
export async function publishedCatalog(): Promise<Catalog> {
  // Re-checking every content hash catches content altered on its way in. Turbopack, for one,
  // turns imported JSON into object literals, where a "__proto__" key silently vanishes.
  return verifyCatalog(catalog);
}
