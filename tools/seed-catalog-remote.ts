/** One-off approved production import. Normal admin work has no CLI/machine dependency. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { remoteCatalog } from "./catalog-remote";
import { repositorySeed, initializeLocalCatalog } from "./authoring-local";
import { planCatalogSeed, seedCatalog } from "../packages/authoring/seed";
import { CatalogStorage } from "../packages/authoring/storage";
const args = process.argv.slice(2),
  values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (
    !["--account", "--database", "--bucket", "--mode"].includes(args[i]) ||
    !args[i + 1] ||
    values.has(args[i])
  )
    throw new Error(
      "Explicit --account --database --bucket --mode apply|verify are required.",
    );
  values.set(args[i], args[i + 1]);
}
const account = values.get("--account")!,
  database = values.get("--database")!,
  bucket = values.get("--bucket")!,
  mode = values.get("--mode");
if (
  account !== "166fd3dff06a9c3f1aef172a25db7ace" ||
  bucket !== "muscle-memory-content" ||
  !["apply", "verify"].includes(mode!)
)
  throw new Error("Target is outside the approved import.");
let credential = process.env.CLOUDFLARE_API_TOKEN;
if (!credential) {
  const c = await readFile(
    resolve(homedir(), "Library/Preferences/.wrangler/config/default.toml"),
    "utf8",
  );
  const m = c.match(/^oauth_token\s*=\s*("[^"\n]+")/m);
  if (!m)
    throw new Error(
      "Existing Wrangler authorization unavailable; no new credentials requested.",
    );
  credential = JSON.parse(m[1]);
}
let storedObjects = 0;
const transfer: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (init?.method === "PUT" && response.ok && ++storedObjects % 10 === 0)
    console.log(
      JSON.stringify({
        phase: "object_writes",
        newObjectsThisRun: storedObjects,
      }),
    );
  return response;
};
const remote = remoteCatalog(
  { account, database, bucket },
  "Bearer " + credential,
  transfer,
);
await remote.assertTargets();
const root = fileURLToPath(new URL("../", import.meta.url));
const input = await repositorySeed(root),
  plan = await planCatalogSeed(input);
if (plan.heads.length !== 69 || plan.versions.length !== 117)
  throw new Error(
    "Frozen import inventory differs; inspect before changing production.",
  );
const storage = new CatalogStorage(remote.db, remote.bucket);
if (mode === "apply") {
  await initializeLocalCatalog(root, remote.db);
  console.log(JSON.stringify({ phase: "schema_ready", database, bucket }));
  console.log(JSON.stringify(await seedCatalog(storage, input)));
}
for (let i = 0; i < plan.objects.length; i += 4) {
  await Promise.all(
    plan.objects.slice(i, i + 4).map(async (object) => {
      const got = await remote.bucket.get(object.key);
      if (!got || (await got.text()) !== object.text)
        throw new Error(
          "Imported object verification failed; no data removed.",
        );
    }),
  );
  if (i % 40 === 0)
    console.log(
      JSON.stringify({
        phase: "verify_objects",
        checked: Math.min(i + 4, plan.objects.length),
        total: plan.objects.length,
      }),
    );
}
const counts = await remote.db
  .prepare(
    `SELECT (SELECT count(*) FROM challenge_heads) heads,(SELECT count(*) FROM published_versions) versions,(SELECT count(*) FROM publication_intents WHERE state='blocked_configuration') blocked_intents,(SELECT count(*) FROM qa_receipts) qa_receipts`,
  )
  .first<any>();
if (
  counts.heads !== 69 ||
  counts.versions !== 117 ||
  counts.blocked_intents !== 69 ||
  counts.qa_receipts !== 0
)
  throw new Error("Seed counts differ; preserve state and reconcile.");
const active = (await storage.catalogState())!.active_object;
if (active !== plan.catalogObject)
  throw new Error("Active catalog pointer differs from the frozen seed.");
const catalog = await storage.readObject(active!);
if ((catalog as any).challenges.length !== 69)
  throw new Error("Active catalog count differs.");
const rows = await remote.db
  .prepare(
    "SELECT challenge_key,published_revision FROM challenge_heads ORDER BY challenge_key",
  )
  .all<any>();
if (
  JSON.stringify(
    rows.results.map((x) => [x.challenge_key, x.published_revision]),
  ) !==
  JSON.stringify(
    [...plan.heads]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((x) => [x.key, x.revision]),
  )
)
  throw new Error("Identity/revision mapping differs.");
const versions = await remote.db
  .prepare(
    "SELECT revision,challenge_key,object_key,metadata_json,runtime_fingerprint FROM published_versions ORDER BY revision",
  )
  .all<any>();
const expectedVersions = [...plan.versions]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((v) => [v.id, v.key, v.object, v.metadata, v.runtime]);
if (
  JSON.stringify(
    versions.results.map((v) => [
      v.revision,
      v.challenge_key,
      v.object_key,
      v.metadata_json,
      v.runtime_fingerprint,
    ]),
  ) !== JSON.stringify(expectedVersions)
)
  throw new Error("Historical registry mapping differs.");
const privateHeads = await remote.db
  .prepare(
    "SELECT challenge_key,draft_object,draft_digest,draft_metadata FROM challenge_heads ORDER BY challenge_key",
  )
  .all<any>();
if (
  JSON.stringify(
    privateHeads.results.map((h) => [
      h.challenge_key,
      h.draft_object,
      h.draft_digest,
      h.draft_metadata,
    ]),
  ) !==
  JSON.stringify(
    [...plan.heads]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((h) => [h.key, h.object, h.digest, h.metadata]),
  )
)
  throw new Error("Private source registry mapping differs.");
console.log(
  JSON.stringify({
    phase: "verified",
    database,
    bucket,
    counts,
    objects: plan.objects.length,
    objectBytes: plan.objects.reduce(
      (n, x) => n + Buffer.byteLength(x.text),
      0,
    ),
    catalogObject: plan.catalogObject,
  }),
);
