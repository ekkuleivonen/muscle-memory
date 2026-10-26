/** Plan by default. --local initializes only a persistent Miniflare emulator; no remote option. */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readChallenges } from "../packages/content/source";
import { revisionId, verifyCatalog } from "../packages/content/revision";
import type { Revision } from "../packages/content/model";
import { digest } from "../packages/authoring/runtime";
import {
  CatalogStorage,
  type Head,
  type Version,
} from "../packages/authoring/storage";
import { planCatalogSeed, seedCatalog } from "../packages/authoring/seed";

const args = process.argv.slice(2);
if (args.some((a) => a !== "--local"))
  throw new Error(
    "Supported option: --local. Remote seeding is not available.",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const sources = readChallenges(resolve(root, "content/challenges"));
const revisions = Object.fromEntries(
  sources.map((s) => [revisionId(s.revision), s.revision]),
);
const catalog = verifyCatalog({
  schemaVersion: "1.0.0",
  challenges: sources.map((s) => ({
    ...s.metadata,
    revision: revisionId(s.revision),
  })),
  revisions,
});
const archives: Record<string, Revision> = {};
for (const file of (await readdir(resolve(root, "content/revisions"))).sort()) {
  if (!/^[a-f0-9]{64}\.json$/.test(file))
    throw new Error(`Unexpected archive filename: ${file}`);
  archives[`sha256:${file.slice(0, -5)}`] = JSON.parse(
    await readFile(resolve(root, "content/revisions", file), "utf8"),
  );
}
if (sources.length !== 69 || Object.keys(archives).length !== 117)
  throw new Error(
    "Frozen seed inventory changed; expected 69 challenges and 117 revisions. Review before seeding.",
  );
const input = { catalog, archives, sources };
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
        "Current metadata context; historical titles are unknown.",
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
    const versions = (
      await db.prepare("SELECT * FROM published_versions").all<Version>()
    ).results;
    const heads = (
      await db.prepare("SELECT * FROM challenge_heads").all<Head>()
    ).results;
    for (const version of versions) {
      const revision = (await storage.readObject(
        version.object_key,
      )) as Revision;
      if (revisionId(revision) !== version.revision)
        throw new Error("Local archive hash verification failed.");
    }
    for (const head of heads) {
      if (
        !head.draft_object ||
        !head.draft_digest ||
        (await digest(await storage.readObject(head.draft_object))) !==
          head.draft_digest
      )
        throw new Error("Local source digest verification failed.");
    }
    const state = await storage.catalogState();
    if (!state?.active_object)
      throw new Error("Local catalog pointer is missing.");
    const published = verifyCatalog(
      await storage.readObject(state.active_object),
    );
    console.log(
      JSON.stringify({
        verifiedLocalHeads: heads.length,
        verifiedLocalArchives: versions.length,
        activeChallenges: published.challenges.length,
      }),
    );
  } finally {
    await mf.dispose();
  }
}
