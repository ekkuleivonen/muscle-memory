/** Node-only, gitignored copy of the managed catalog. Never imported by client components. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Revision } from "./model";
import type { ChallengeSource } from "./source";
import { revisionId, verifyCatalog } from "./revision";
import { normalizedSource } from "../authoring/source";
import { canonical, type Json } from "../domain/json";

export interface CatalogCopy {
  schemaVersion: "managed-catalog-copy-1";
  exportedAt: string;
  catalog: Catalog;
  archives: Record<string, Revision>;
  sources: ChallengeSource[];
}
const text = (v: unknown) => canonical(v as Json);
/** Draft normalization strips the publication pin; immutable stored sources retain it explicitly. */
export function normalizeStoredSource(
  source: ChallengeSource,
): ChallengeSource {
  const result = normalizedSource(source);
  const pin = source.revision.publication;
  if (!pin) return result;
  const metadata = normalizedSource({
    ...source,
    metadata: pin.metadata,
  }).metadata;
  const { engine, version, fingerprint } = pin.runtime;
  if (
    typeof engine !== "string" ||
    typeof version !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(fingerprint)
  )
    throw new Error("Invalid publication runtime pin.");
  return {
    ...result,
    revision: {
      ...result.revision,
      publication: { metadata, runtime: { engine, version, fingerprint } },
    },
  };
}
export function validateCopy(value: unknown): CatalogCopy {
  const v = value as CatalogCopy;
  if (
    !v ||
    v.schemaVersion !== "managed-catalog-copy-1" ||
    !Number.isFinite(Date.parse(v.exportedAt))
  )
    throw new Error("Invalid managed catalog copy.");
  const catalog = verifyCatalog(v.catalog);
  if (!v.archives || !Array.isArray(v.sources))
    throw new Error("Incomplete managed catalog copy.");
  for (const [id, revision] of Object.entries(v.archives))
    if (revisionId(revision) !== id)
      throw new Error("Catalog archive hash mismatch.");
  const sources = new Map<string, ChallengeSource>();
  for (const source of v.sources) {
    const normalized = normalizeStoredSource(source);
    if (text(normalized) !== text(source) || sources.has(source.metadata.key))
      throw new Error("Invalid or duplicate private catalog source.");
    sources.set(source.metadata.key, source);
  }
  for (const metadata of catalog.challenges) {
    const source = sources.get(metadata.key);
    const { revision, ...rest } = metadata;
    if (
      !source ||
      revisionId(source.revision) !== revision ||
      text(rest) !== text(source.metadata) ||
      text(v.archives[revision]) !== text(source.revision)
    )
      throw new Error(
        "Published catalog and exact-version private source differ.",
      );
  }
  if (sources.size !== catalog.challenges.length)
    throw new Error("Copy must name only published sources.");
  return {
    schemaVersion: v.schemaVersion,
    exportedAt: v.exportedAt,
    catalog,
    archives: v.archives,
    sources: [...sources.values()],
  };
}
export function catalogCopyPath(
  root = fileURLToPath(new URL("../../", import.meta.url)),
): string {
  return resolve(
    root,
    process.env.MM_CATALOG_COPY ?? ".local/catalog-copy.json",
  );
}
export function readCatalogCopy(root?: string): CatalogCopy {
  try {
    return validateCopy(
      JSON.parse(readFileSync(catalogCopyPath(root), "utf8")),
    );
  } catch {
    throw new Error(
      "Managed catalog copy missing or invalid. Run npm run catalog:pull with authorized read access; no repository fallback exists.",
    );
  }
}
