import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { CatalogStorage, AuthoringConflict, type Statement } from "./storage";

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
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../../migrations/catalog/0001_catalog.sql", import.meta.url),
      "utf8",
    ),
  );
  const objects = new Map<string, string>();
  let failObjectWrite = false;
  const db = {
    prepare: (text: string) => new LocalStatement(sql, text),
    async batch(statements: Statement[]) {
      sql.exec("BEGIN");
      try {
        const rows = statements.map((s) => (s as LocalStatement).run());
        sql.exec("COMMIT");
        return rows;
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
      if (failObjectWrite) throw new Error("R2 unavailable");
      if (objects.has(key)) return null;
      objects.set(key, value);
      return { etag: "local" };
    },
  };
  const storage = new CatalogStorage(db, bucket);
  const request = (id: string, expected: number, digest = "source-one") => ({
    id,
    expected,
    digest,
    key: "PY-001",
    action: "create" as const,
    revision: null,
    at: "2026-10-26T00:00:00Z",
    result: { generation: expected + 1 },
  });
  const create = db.prepare(
    `INSERT INTO challenge_heads(challenge_key,generation,lifecycle,updated_at) VALUES ('PY-001',1,'draft','now')`,
  );
  return {
    sql,
    db,
    storage,
    request,
    create,
    objects,
    failObjects: () => {
      failObjectWrite = true;
    },
  };
}
test("atomic creation stores state, audit and idempotent result together", async () => {
  const f = fixture();
  await f.storage.operation(f.request("request_create_1", 0), [f.create]);
  assert.equal((await f.storage.head("PY-001"))?.generation, 1);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    1,
  );
  assert.deepEqual(
    await f.storage.operation(f.request("request_create_1", 0), [f.create]),
    { generation: 1 },
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    1,
  );
  await assert.rejects(
    f.storage.operation(f.request("request_create_1", 0, "different-source"), [
      f.create,
    ]),
    AuthoringConflict,
  );
  f.sql.close();
});
test("stale concurrent writes and intermediate SQL failures leave no partial operation/audit", async () => {
  const f = fixture();
  await f.storage.operation(f.request("request_create_1", 0), [f.create]);
  await assert.rejects(
    f.storage.operation(f.request("request_stale_1", 0), [f.create]),
    AuthoringConflict,
  );
  await assert.rejects(
    f.storage.operation(f.request("request_broken_1", 1), [
      f.db.prepare("UPDATE challenge_heads SET generation = 2"),
      f.db.prepare("INSERT INTO missing_table VALUES (1)"),
    ]),
  );
  assert.equal((await f.storage.head("PY-001"))?.generation, 1);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_mutations").get()?.n,
    1,
  );
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_audit").get()?.n,
    1,
  );
  f.sql.close();
});
test("immutable R2 objects tolerate retries but reject changed bytes and writes can fail before publication", async () => {
  const f = fixture();
  await f.storage.immutableObject("private/draft/a", '{"value":1}');
  await f.storage.immutableObject("private/draft/a", '{"value":1}');
  await assert.rejects(
    f.storage.immutableObject("private/draft/a", '{"value":2}'),
    AuthoringConflict,
  );
  f.failObjects();
  await assert.rejects(
    f.storage.immutableObject("published/revision-b", "{}"),
    /R2 unavailable/,
  );
  assert.equal(await f.storage.head("PY-001"), null);
  assert.equal(
    f.sql.prepare("SELECT count(*) AS n FROM operator_mutations").get()?.n,
    0,
  );
  f.sql.close();
});
test("published snapshots cannot be overwritten/deleted and publication intent remains blocked", async () => {
  const f = fixture();
  await f.storage.operation(f.request("request_create_1", 0), [f.create]);
  const statements = [
    f.db.prepare(
      `INSERT INTO published_versions VALUES ('rev1','PY-001','published/rev1','{}','runtime1','now')`,
    ),
    f.db.prepare(
      `UPDATE challenge_heads SET generation=2,lifecycle='published',published_revision='rev1' WHERE challenge_key='PY-001'`,
    ),
    f.db.prepare(
      `INSERT INTO publication_intents VALUES ('rev1','PY-001','blocked_configuration','now')`,
    ),
  ];
  await f.storage.operation(
    {
      ...f.request("request_publish_1", 1),
      action: "publish",
      revision: "rev1",
    },
    statements,
  );
  assert.equal(
    f.sql.prepare("SELECT state FROM publication_intents").get()?.state,
    "blocked_configuration",
  );
  assert.throws(
    () =>
      f.sql.prepare(`UPDATE published_versions SET object_key='changed'`).run(),
    /immutable/,
  );
  assert.throws(
    () => f.sql.prepare("DELETE FROM published_versions").run(),
    /immutable/,
  );
  await assert.rejects(
    f.storage.operation(
      { ...f.request("request_publish_2", 2), action: "publish" },
      [
        f.db.prepare(`UPDATE challenge_heads SET generation=3`),
        f.db.prepare(
          `INSERT INTO publication_intents VALUES ('rev2','PY-001','running','now')`,
        ),
      ],
    ),
  );
  assert.equal((await f.storage.head("PY-001"))?.generation, 2);
  f.sql.close();
});
