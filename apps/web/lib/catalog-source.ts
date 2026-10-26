import { verifyCatalog } from "../../../packages/content/revision";
import type { Catalog } from "../../../packages/content/model";
import { readManagedCatalog, readManagedRevision } from "./managed-catalog";
import type { HistoricalChallenge } from "../../../packages/authoring/contracts";
import catalog from "../../../content/catalog.json";

/**
 * The catalog the app serves: every challenge's metadata and its live revision. Managed storage when configured; otherwise built from
 * content/challenges by tools/build-content.ts before dev, builds and tests.
 */
export async function publishedCatalog(): Promise<Catalog> {
  // Re-checking every content hash catches content altered on its way in. Turbopack, for one,
  // turns imported JSON into object literals, where a "__proto__" key silently vanishes.
  return (await readManagedCatalog()) ?? verifyCatalog(catalog);
}

/** Only registered public snapshots; configured storage failures never fall back to the bundle. */
export async function publicChallenge(
  key: string,
  revision?: string,
): Promise<HistoricalChallenge | null> {
  const managed = await readManagedRevision(key.toUpperCase(), revision);
  if (managed !== undefined) return managed;
  const bundled = await verifyCatalog(catalog);
  const metadata = bundled.challenges.find(
    (item) => item.key === key.toUpperCase(),
  );
  // Unconfigured installations retain their previous bundled-current behavior.
  if (!metadata || (revision && revision !== metadata.revision)) return null;
  return {
    metadata,
    revision: bundled.revisions[metadata.revision],
    archived: false,
  };
}

/** Receipts need the public title, including legacy links whose archived snapshot was not bundled. */
export async function publicReceipt(
  key: string,
  revision: string,
): Promise<Pick<HistoricalChallenge, "metadata" | "archived"> | null> {
  const managed = await readManagedRevision(key.toUpperCase(), revision);
  if (managed !== undefined) return managed;
  const bundled = await verifyCatalog(catalog);
  const metadata = bundled.challenges.find(
    (item) => item.key === key.toUpperCase(),
  );
  return metadata ? { metadata, archived: false } : null;
}
