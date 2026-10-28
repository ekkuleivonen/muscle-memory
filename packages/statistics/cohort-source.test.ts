import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Statement } from "../authoring/storage";
import type { ChallengeSource } from "../content/source";
import { revisionId } from "../content/revision";
import { engineFor } from "../runner/engines";
import { readCohortBuildSpec } from "./cohort-source";

// Public synthetic source. Publication uses exactly {...source.metadata, revision:id} and
// writes source.revision separately, as AuthoringService.publish does, not draft_metadata.
const source: Pick<ChallengeSource, "metadata" | "revision"> = {
  metadata: {
    key: "JS-001",
    title: "Synthetic",
    summary: "Fixture",
    difficulty: "easy",
    tags: [],
  },
  revision: {
    challenge: "JS-001",
    language: "javascript",
    task: "Synthetic identity.",
    file: "synthetic.js",
    starter: "",
    entrypoint: "identity",
    cases: [{ id: "example", input: 1, expected: 1, hidden: false }],
    rules: [],
  },
};
const id = revisionId(source.revision);
const now = new Date("2026-10-27T12:00:00.000Z");
function fixture(tags: string[] = []) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../../migrations/catalog/0001_catalog.sql", import.meta.url),
      "utf8",
    ),
  );
  const metadata = { ...source.metadata, tags, revision: id };
  const objectKey = `published/revisions/${id.slice(7)}.json`;
  sql
    .prepare(
      `INSERT INTO challenge_heads
    (challenge_key,generation,lifecycle,published_revision,updated_at) VALUES (?,1,'published',?,?)`,
    )
    .run(source.metadata.key, id, now.toISOString());
  sql
    .prepare("INSERT INTO published_versions VALUES (?,?,?,?,?,?)")
    .run(
      id,
      source.metadata.key,
      objectKey,
      JSON.stringify(metadata),
      "synthetic-fingerprint",
      "2026-10-01T00:00:00.000Z",
    );
  const objects = new Map([[objectKey, JSON.stringify(source.revision)]]);
  const db = {
    prepare(query: string): Statement {
      let values: unknown[] = [];
      const statement: Statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first<T>() {
          return (sql.prepare(query).get(...(values as never[])) ??
            null) as T | null;
        },
        async all<T>() {
          return {
            results: sql.prepare(query).all(...(values as never[])) as T[],
          };
        },
      };
      return statement;
    },
    async batch() {
      throw new Error("Read-only fixture.");
    },
  };
  const content = {
    async get(key: string) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
  };
  return { sql, db, content, objects, objectKey, metadata };
}

test("real published metadata shape without language loads runtime from hash-verified revision", async () => {
  const f = fixture();
  try {
    assert.equal("language" in f.metadata, false);
    assert.equal(
      f.sql.prepare("SELECT draft_metadata FROM challenge_heads").get()
        ?.draft_metadata,
      null,
    );
    const spec = await readCohortBuildSpec(f.db, f.content, "JS-001", id, now);
    assert.deepEqual(spec, {
      challenge: "JS-001",
      revision: id,
      window: {
        from: "2026-10-01T00:00:00.000Z",
        publication: "2026-10-01T00:00:00.000Z",
        to: now.toISOString(),
      },
      runtime: engineFor(source.revision.language)!.runtime,
    });
    assert.equal(JSON.stringify(spec).includes("Synthetic identity"), false);
  } finally {
    f.sql.close();
  }
});

test("missing/tampered immutable objects and noncurrent or archived revisions cannot build", async () => {
  const f = fixture();
  try {
    f.objects.delete(f.objectKey);
    assert.equal(
      await readCohortBuildSpec(f.db, f.content, "JS-001", id, now),
      null,
    );
    f.objects.set(
      f.objectKey,
      JSON.stringify({
        ...source.revision,
        task: "Tampered synthetic revision.",
      }),
    );
    await assert.rejects(
      readCohortBuildSpec(f.db, f.content, "JS-001", id, now),
    );
    f.objects.set(f.objectKey, JSON.stringify(source.revision));
    f.sql.prepare("UPDATE challenge_heads SET lifecycle='archived'").run();
    assert.equal(
      await readCohortBuildSpec(f.db, f.content, "JS-001", id, now),
      null,
    );
    f.sql
      .prepare(
        "UPDATE challenge_heads SET lifecycle='published', published_revision=?",
      )
      .run(`sha256:${"a".repeat(64)}`);
    assert.equal(
      await readCohortBuildSpec(f.db, f.content, "JS-001", id, now),
      null,
    );
    await assert.rejects(
      readCohortBuildSpec(f.db, f.content, "' OR TRUE", id, now),
    );
  } finally {
    f.sql.close();
  }
});

test("synthetic QA publication remains excluded before reading private content", async () => {
  const f = fixture(["synthetic-qa"]);
  try {
    assert.equal(
      await readCohortBuildSpec(
        f.db,
        {
          async get() {
            throw new Error("Must not read");
          },
        },
        "JS-001",
        id,
        now,
      ),
      null,
    );
  } finally {
    f.sql.close();
  }
});
