/** Plan by default. --local initializes only a persistent Miniflare emulator; no remote option. */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repositorySeed } from "./authoring-local";
import { revisionId, verifyCatalog } from "../packages/content/revision";
import type { Revision } from "../packages/content/model";
import { digest } from "../packages/authoring/runtime";
import {
  CatalogStorage,
  type Head,
  type Version,
} from "../packages/authoring/storage";
import {
  planCatalogSeed,
  seedCatalog,
  verifySeededCatalog,
} from "../packages/authoring/seed";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--local"))
  throw new Error(
    "Supported option: --local. Remote seeding is not available.",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const input = await repositorySeed(root);
const { sources, catalog, archives } = input;
const plan = await planCatalogSeed(input);
console.log(
  JSON.stringify(
    {
      mode: args.includes("--local") ? "local-emulator" : "plan-only",
      challenges: plan.heads.length,
      revisions: plan.versions.length,
      immutableObjects: plan.objects.length,
      catalogObject: plan.catalogObject,
      historicalMetadata:
        "Immutable publication metadata where available; current metadata for imported legacy revisions.",
      qa: "Imported publications; no fresh QA receipts.",
    },
    null,
    2,
  ),
);
if (args.includes("--local")) {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "catalog-seed",
          modules: true,
          script:
            "export default { fetch() { return new Response('Local catalog seed'); } };",
          d1Databases: ["CATALOG_DB"],
          r2Buckets: ["CONTENT"],
        },
      ],
      resourcePersistencePath: resolve(root, ".local/catalog-seed"),
    }),
  );
  try {
    const db = await mf.getD1Database("CATALOG_DB");
    const bucket = await mf.getR2Bucket("CONTENT");
    const table = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_state'",
      )
      .first();
    if (!table) {
      // D1 exec treats each newline as a statement. Preserve the migration's multiline triggers.
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
        pending += `${line}\n`;
        if (trigger ? /\bEND;$/i.test(line.trim()) : /;\s*$/.test(line)) {
          statements.push(pending);
          pending = "";
          trigger = false;
        }
      }
      if (pending.trim())
        throw new Error("Incomplete local migration statement.");
      await db.batch(statements.map((statement) => db.prepare(statement)));
    }
    const storage = new CatalogStorage(db, bucket);
    console.log(JSON.stringify(await seedCatalog(storage, input)));
    console.log(JSON.stringify(await verifySeededCatalog(storage)));
  } finally {
    await mf.dispose();
  }
}
