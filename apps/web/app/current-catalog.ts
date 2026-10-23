import type { Catalog } from "../../../packages/catalog/catalog";

/** Refresh published content before each start/assessment, without uploading practice records. */
export async function currentCatalog(
  fetchCatalog: typeof fetch = fetch,
): Promise<Catalog> {
  const response = await fetchCatalog("/api/catalog", { cache: "no-store" });
  if (!response.ok)
    throw new Error("Published content is unavailable. Please retry.");
  const catalog = (await response.json()) as Catalog;
  if (catalog.schemaVersion !== "1.0.0" || !catalog.entries)
    throw new Error("Unsupported content catalog.");
  return catalog;
}
