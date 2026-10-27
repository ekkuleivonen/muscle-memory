/** Operator-only local fixtures. Never imports into the public app or contacts Cloudflare. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { CatalogStorage } from "../packages/authoring/storage";
import { readCatalogCopy } from "../packages/content/copy";
export async function localAuthoring(root: string, persistence?: string) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "catalog-local",
          modules: true,
          script:
            'export default {fetch(){return new Response("Local authoring fixture");}}',
          d1Databases: ["CATALOG_DB"],
          r2Buckets: ["CONTENT"],
        },
      ],
      ...(persistence ? { resourcePersistencePath: resolve(persistence) } : {}),
    }),
  );
  const db = await mf.getD1Database("CATALOG_DB"),
    bucket = await mf.getR2Bucket("CONTENT");
  await initializeLocalCatalog(root, db);
  return {
    mf,
    db,
    bucket,
    storage: new CatalogStorage(db, bucket),
    dispose: () => mf.dispose(),
  };
}
export async function initializeLocalCatalog(root: string, db: any) {
  const exists = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_state'",
    )
    .first();
  if (!exists) {
    const schema = await readFile(
      resolve(root, "migrations/catalog/0001_catalog.sql"),
      "utf8",
    );
    const statements: string[] = [];
    let pending = "",
      trigger = false;
    for (const line of schema.split("\n")) {
      if (!line.trim() || line.trim().startsWith("--")) continue;
      if (/^CREATE TRIGGER/i.test(line.trim())) trigger = true;
      pending += line + "\n";
      if (trigger ? /\bEND;$/i.test(line.trim()) : /;\s*$/.test(line)) {
        statements.push(pending);
        pending = "";
        trigger = false;
      }
    }
    if (pending.trim()) throw new Error("Incomplete local schema.");
    await db.batch(statements.map((sql) => db.prepare(sql)));
  } else {
    const columns = (
      await db
        .prepare("PRAGMA table_info(validation_sessions)")
        .all<{ name: string }>()
    ).results;
    if (!columns.some((c) => c.name === "consumed_at"))
      throw new Error(
        "Local fixture schema differs. Use a new local state path; no data was reset.",
      );
  }
}
/** A local seed is always derived from the managed copy, including registered history. */
export async function repositorySeed(root: string) {
  const { sources, catalog, archives } = readCatalogCopy(root);
  return { sources, catalog, archives };
}
