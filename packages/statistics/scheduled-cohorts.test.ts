import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { revisionId } from "../content/revision";
import { engineFor } from "../runner/engines";
import {
  refreshHumanSummaries,
  scheduledHumanSummaries,
  readHumanSummary,
  type HumanSummaryEnvironment,
} from "./scheduled-cohorts";
const now = new Date("2026-10-27T12:00:00.000Z");
const generation = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function fixture(count = 1) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE challenge_heads(challenge_key TEXT,lifecycle TEXT,published_revision TEXT);CREATE TABLE published_versions(challenge_key TEXT,revision TEXT,metadata_json TEXT,published_at TEXT,object_key TEXT,runtime_fingerprint TEXT);",
  );
  const objects = new Map<string, string>();
  const revisions: { challenge: string; revision: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const challenge = `JS-${String(i).padStart(3, "0")}`;
    const revision = {
      challenge,
      language: "javascript",
      task: "Synthetic identity.",
      file: "synthetic.js",
      starter: "",
      entrypoint: "identity",
      cases: [{ id: "example", input: 1, expected: 1, hidden: false }],
      rules: [],
    };
    const hash = revisionId(revision as any),
      key = `published/revisions/${hash.slice(7)}.json`;
    const metadata = {
      key: challenge,
      title: "Synthetic",
      summary: "Fixture",
      difficulty: "easy",
      tags: [],
      revision: hash,
    };
    db.prepare("INSERT INTO challenge_heads VALUES(?,?,?)").run(
      challenge,
      "published",
      hash,
    );
    db.prepare("INSERT INTO published_versions VALUES(?,?,?,?,?,?)").run(
      challenge,
      hash,
      JSON.stringify(metadata),
      "2026-10-01T00:00:00.000Z",
      key,
      "synthetic",
    );
    objects.set(key, JSON.stringify(revision));
    revisions.push({ challenge, revision: hash });
  }
  const catalog: any = {
    prepare(query: string) {
      let values: unknown[] = [];
      const s = {
        bind(...v: unknown[]) {
          values = v;
          return s;
        },
        async first() {
          return db.prepare(query).get(...(values as any[])) ?? null;
        },
        async all() {
          return { results: db.prepare(query).all(...(values as any[])) };
        },
      };
      return s;
    },
    async batch() {
      throw Error("read-only");
    },
  };
  let current: string | null = generation;
  let checks = 0;
  const control = {
    generation: async () => current,
    check: async (ids: string[]) => {
      checks++;
      return ids.map(() => generation);
    },
    authorize: async (g: string) => g === current,
  };
  const env: Required<HumanSummaryEnvironment> = {
    HUMAN_SUMMARY_CACHE_ENABLED: "true",
    ADMIN_STATS_SQL_TOKEN: "synthetic-token",
    CATALOG_DB: catalog,
    COMPARISON_ELIGIBILITY: control,
    CONTENT: {
      get: async (key) => {
        const text = objects.get(key);
        return text === undefined
          ? null
          : { size: Buffer.byteLength(text), text: async () => text };
      },
      put: async (key, text) => {
        objects.set(key, text);
      },
    },
  };
  const runtime = engineFor("javascript")!.runtime;
  const rows = Array.from({ length: 20 }, (_, i) => ({
    participant_id: `synthetic-${i}`,
    runtime: JSON.stringify(runtime),
    editor: JSON.stringify({
      name: "CodeMirror",
      features: ["syntax-highlighting"],
    }),
    diagnostics: 0,
    practice: "first",
    completed: 1,
    first_pass: 1,
    submissions: 2,
    browsers: 1,
  }));
  let requests = 0,
    active = 0,
    peak = 0;
  const request: typeof fetch = async (url, init) => {
    requests++;
    active++;
    peak = Math.max(peak, active);
    assert.match(String(url), /\/basin-sql\/query\/muscle-memory-events$/);
    assert.equal(init?.redirect, "manual");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ["query"]);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return Response.json({
      success: true,
      result: {
        rows: body.query.includes("COUNT(DISTINCT e.participant_id)")
          ? revisions
          : rows,
      },
    });
  };
  return {
    env,
    request,
    objects,
    revisions,
    runtime,
    db,
    get requests() {
      return requests;
    },
    get peak() {
      return peak;
    },
    get checks() {
      return checks;
    },
    invalidate() {
      current = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    },
  };
}
test("disabled human schedule performs no binding or SQL access", async () => {
  const env = {
    get CATALOG_DB(): never {
      throw Error("must not access");
    },
  };
  assert.deepEqual(await scheduledHumanSummaries(env), { state: "disabled" });
});
test("discovery and exact build write aggregate-only cache; serving never queries SQL", async () => {
  const f = fixture();
  try {
    const result = await refreshHumanSummaries(f.env, now, f.request);
    assert.equal(result.state, "finished");
    assert.equal(result.queries, 2);
    assert.equal(result.refreshed, 1);
    const snapshot = [...f.objects.entries()].find(([key]) =>
      key.startsWith("comparison-summaries/humans/"),
    )!;
    assert.doesNotMatch(
      snapshot[1],
      /participant_id|synthetic-\d|synthetic-token/,
    );
    const calls = f.requests;
    const read = await readHumanSummary(
      f.env,
      f.revisions[0].challenge,
      f.revisions[0].revision,
      f.runtime,
    );
    assert.equal(read?.groups.length, 1);
    assert.equal(f.requests, calls);
    const raw = JSON.parse(snapshot[1]);
    const at = new Date();
    raw.computedAt = at.toISOString();
    raw.window.to = at.toISOString();
    raw.window.from = new Date(at.getTime() - 86400000).toISOString();
    raw.window.publication = raw.window.from;
    raw.expiresAt = new Date(at.getTime() + 3600000).toISOString();
    f.objects.set(snapshot[0], JSON.stringify(raw));
    assert.equal(
      (
        await readHumanSummary(
          f.env,
          f.revisions[0].challenge,
          f.revisions[0].revision,
          f.runtime,
        )
      )?.groups.length,
      1,
    );
    f.invalidate();
    assert.equal(
      await readHumanSummary(
        f.env,
        f.revisions[0].challenge,
        f.revisions[0].revision,
        f.runtime,
      ),
      null,
    );
    assert.equal(f.requests, calls);
  } finally {
    f.db.close();
  }
});
test("100 revisions respect one discovery plus99 exact queries and two builds concurrent", async () => {
  const f = fixture(100);
  try {
    const r = await refreshHumanSummaries(f.env, now, f.request);
    assert.equal(r.queries, 100);
    assert.equal(r.refreshed, 99);
    assert.ok(f.peak <= 2);
    assert.equal(f.requests, 100);
  } finally {
    f.db.close();
  }
});
test("a stalled SQL transport stops at the whole-run deadline even if a mock ignores abort", async () => {
  const f = fixture();
  try {
    const start = Date.now();
    const result = await refreshHumanSummaries(
      f.env,
      now,
      () => new Promise(() => {}),
      20,
    );
    assert.equal(result.state, "unavailable");
    assert.ok(Date.now() - start < 500);
    assert.equal(f.checks, 0);
  } finally {
    f.db.close();
  }
});
