import { verifyCatalog, type Catalog } from "../../../packages/catalog/catalog";
import reference from "../../../content/catalog/reference.v1.json";

/** True in builds made with DEMO_CATALOG=1 (inlined by next.config `env`). */
export const DEMO = process.env.DEMO_CATALOG === "1";

/** Published content, plus the synthetic demo catalog in demo builds. */
export async function publishedCatalog(): Promise<Catalog> {
  // Re-checking every digest catches content altered on its way in. Turbopack, for one,
  // turns imported JSON into object literals, where a "__proto__" key silently vanishes.
  const catalog = verifyCatalog(reference);
  // The import must sit inside this inline comparison so builds without the flag drop it
  // and the demo content with it.
  if (process.env.DEMO_CATALOG === "1") {
    const demo = verifyCatalog(
      (await import("../../../content/demo/catalog.json")).default,
    );
    return { ...catalog, entries: { ...catalog.entries, ...demo.entries } };
  }
  return catalog;
}
