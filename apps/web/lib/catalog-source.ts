import type { Catalog } from "../../../packages/catalog/catalog";
import reference from "../../../content/catalog/reference.v1.json";

/** True in builds made with DEMO_CATALOG=1 (inlined by next.config `env`). */
export const DEMO = process.env.DEMO_CATALOG === "1";

/** Published content, plus the synthetic demo catalog in demo builds. */
export async function publishedCatalog(): Promise<Catalog> {
  const catalog = reference as unknown as Catalog;
  // The import must sit inside this inline comparison so builds without the flag drop it
  // and the demo content with it.
  if (process.env.DEMO_CATALOG === "1") {
    const demo = (await import("../../../content/demo/catalog.json"))
      .default as unknown as Catalog;
    return { ...catalog, entries: { ...catalog.entries, ...demo.entries } };
  }
  return catalog;
}
