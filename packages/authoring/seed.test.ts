import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { CatalogStorage, type Statement } from "./storage";
import { readChallenge } from "../content/source";
import { revisionId } from "../content/revision";
import { planCatalogSeed, seedCatalog, type SeedInput } from "./seed";

const source = readChallenge(
  new URL("../../content/challenges/PY-001", import.meta.url).pathname,
);
const id = revisionId(source.revision);
const input: SeedInput = {
  sources: [source],
  archives: { [id]: source.revision },
  catalog: {
    schemaVersion: "1.0.0",
    challenges: [{ ...source.metadata, revision: id }],
    revisions: { [id]: source.revision },
  },
};
class LocalStatement implements Statement {
  values: unknown[] = [];
  constructor(
    readonly db: DatabaseSync,
    readonly sql: string,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...(this.values as never[])) ??
      null) as T | null;
  }
  async all<T>() {
    return {
      results: this.db
        .prepare(this.sql)
        .all(...(this.values as never[])) as T[],
    };
  }
  run() {
    return this.db.prepare(this.sql).run(...(this.values as never[]));
  }
}
const schema = readFileSync(
  new URL("../../migrations/catalog/0001_catalog.sql", import.meta.url),
  "utf8",
);
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(schema);
  const objects = new Map<string, string>();
  let failBatch = false,
    failObjects = false;
  const db = {
    prepare: (query: string) => new LocalStatement(sql, query),
    async batch(statements: Statement[]) {
      sql.exec("BEGIN");
      try {
        const result = statements.map((s, i) => {
          if (failBatch && i === 3) throw new Error("D1 failure");
          return (s as LocalStatement).run();
        });
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const bucket = {
    async get(key: string) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
    async put(key: string, value: string) {
      if (failObjects) throw new Error("R2 failure");
      if (objects.has(key)) return null;
      objects.set(key, value);
      return {};
    },
  };
  return {
    sql,
    objects,
    storage: new CatalogStorage(db, bucket),
    failBatch: (value: boolean) => {
      failBatch = value;
    },
    failObjects: () => {
      failObjects = true;
    },
  };
}

test("seed imports public history/private source and no invented QA; second seed preserves changes", async () => {
  const f = fixture();
  const result = await seedCatalog(f.storage, input, "2026-10-26T00:00:00Z");
  assert.equal(result.status, "seeded");
  const head = await f.storage.head(source.metadata.key);
  assert.equal(head?.generation, 1);
  assert.equal(head?.qa_receipt, null);
  assert.equal(head?.published_revision, id);
  assert.deepEqual(await f.storage.readObject(head!.draft_object!), source);
  const version = f.sql.prepare("SELECT * FROM published_versions").get()!;
  assert.deepEqual(
    await f.storage.readObject(String(version.object_key)),
    source.revision,
  );
  assert.equal(
    JSON.stringify(
      await f.storage.readObject(String(version.object_key)),
    ).includes(source.private.solution),
    false,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM qa_receipts").get()?.n,
    0,
  );
  assert.equal(
    f.sql.prepare("SELECT state FROM publication_intents").get()?.state,
    "blocked_configuration",
  );
  assert.equal(
    f.sql.prepare("SELECT action FROM operator_audit").get()?.action,
    "catalog.seed",
  );
  f.sql.exec("UPDATE challenge_heads SET generation=2,lifecycle='archived'");
  assert.deepEqual(await seedCatalog(f.storage, input), {
    status: "already-initialized",
  });
  assert.equal((await f.storage.head(source.metadata.key))?.generation, 2);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    1,
  );
  f.sql.close();
});

test("invalid archive, missing source and public private fields fail before writes", async () => {
  for (const invalid of [
    { ...input, archives: { [id]: { ...source.revision, task: "changed" } } },
    { ...input, sources: [] },
    (() => {
      const revision = { ...source.revision, solution: "PRIVATE" };
      const hash = revisionId(revision);
      return {
        ...input,
        archives: { [hash]: revision, [id]: source.revision },
      };
    })(),
  ]) {
    const f = fixture();
    await assert.rejects(seedCatalog(f.storage, invalid));
    assert.equal(f.objects.size, 0);
    assert.equal((await f.storage.catalogState())?.seeded_at, null);
    f.sql.close();
  }
});

test("R2 and atomic D1 failure leave no visible catalog; immutable object retry succeeds", async () => {
  const f = fixture();
  f.failBatch(true);
  await assert.rejects(seedCatalog(f.storage, input), /D1 failure/);
  assert.ok(f.objects.size > 0);
  assert.equal((await f.storage.catalogState())?.active_object, null);
  assert.equal(await f.storage.head(source.metadata.key), null);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    0,
  );
  f.failBatch(false);
  assert.equal((await seedCatalog(f.storage, input)).status, "seeded");
  f.sql.close();
  const g = fixture();
  g.failObjects();
  await assert.rejects(seedCatalog(g.storage, input), /R2 failure/);
  assert.equal((await g.storage.catalogState())?.generation, 0);
  g.sql.close();
});

test("nonempty uninitialized database refuses seed without object writes", async () => {
  const f = fixture();
  f.sql.exec(
    "INSERT INTO challenge_heads(challenge_key,generation,lifecycle,updated_at) VALUES ('PY-099',1,'draft','now')",
  );
  await assert.rejects(seedCatalog(f.storage, input), /not a fresh/);
  assert.equal(f.objects.size, 0);
  f.sql.close();
});

test("concurrent seeds commit once and return a safe initialized result", async () => {
  const f = fixture();
  const results = await Promise.all([
    seedCatalog(f.storage, input),
    seedCatalog(f.storage, input),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [
    "already-initialized",
    "seeded",
  ]);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    1,
  );
  f.sql.close();
});

test("full frozen repository plan preserves all 69 current heads and 117 legacy hashes", async () => {
  const { readChallenges } = await import("../content/source");
  const { readdirSync } = await import("node:fs");
  const sources = readChallenges(
    new URL("../../content/challenges", import.meta.url).pathname,
  );
  const revisions = Object.fromEntries(
    sources.map((s) => [revisionId(s.revision), s.revision]),
  );
  const archives = Object.fromEntries(
    readdirSync(new URL("../../content/revisions", import.meta.url)).map(
      (name) => [
        `sha256:${name.slice(0, -5)}`,
        JSON.parse(
          readFileSync(
            new URL(`../../content/revisions/${name}`, import.meta.url),
            "utf8",
          ),
        ),
      ],
    ),
  );
  const plan = await planCatalogSeed({
    sources,
    archives,
    catalog: {
      schemaVersion: "1.0.0",
      challenges: sources.map((s) => ({
        ...s.metadata,
        revision: revisionId(s.revision),
      })),
      revisions,
    },
  });
  assert.equal(plan.heads.length, 69);
  assert.equal(plan.versions.length, 117);
  assert.equal(plan.objects.length, 187);
  for (const version of plan.versions)
    assert.equal(
      revisionId(
        JSON.parse(plan.objects.find((o) => o.key === version.object)!.text),
      ),
      version.id,
    );
});
