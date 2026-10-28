/**
 * Acceptance for human comparisons, end to end on synthetic data only:
 *   20 browsers' real capture trace → the shipped member SQL (run in SQLite behind a stand-in for
 *   the Basin endpoint) → CONTROL checks → private snapshot (≤ 1 hour) → the on-demand
 *   `/api/cohort` read → the Stats bridge → the rendered report,
 * with the viewer's attempts from the real producer (capture trace → localHistory). No player data,
 * no live Basin, CONTROL or R2; their adapters are in-memory stand-ins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { trace } from "../../../../packages/developer-profile/fixtures";
import { localHistory } from "../../../../packages/developer-profile/history";
import { revisionId } from "../../../../packages/content/revision";
import { engineFor } from "../../../../packages/runner/engines";
import { fields, many, type Event } from "../../../../packages/statistics/cohort-fixtures";
import { humanSummaryOnRequest, type HumanSummaryEnvironment } from "../../../../packages/statistics/scheduled-cohorts";
import type { CohortRead } from "../../../../packages/statistics/cohort";
import { buildReport, type ReportAttempt } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import type { StoredProfile } from "../../lib/profile";
import { comparisonRequests, comparisons, pairKey } from "./comparisons";
import { ReportBody } from "./stats";

const runtime = engineFor("javascript")!.runtime;
const source = {
  challenge: "JS-001",
  language: "javascript",
  task: "Synthetic identity.",
  file: "synthetic.js",
  starter: "",
  entrypoint: "identity",
  cases: [{ id: "example", input: 1, expected: 1, hidden: false }],
  rules: [],
};
const revision = revisionId(source as never);
const now = new Date("2026-10-28T00:00:00.000Z");
const catalog = [
  { key: "JS-001", revision, title: "Synthetic Sum", language: "javascript", difficulty: "easy", tags: [], runnable: true },
] as unknown as ChallengeSummary[];
const adult = { version: "2", createdAt: "2026-10-20T00:00:00Z", stealth: false, profile: { age: "25-34" } } as unknown as StoredProfile;

/** The shared synthetic trace, moved onto this revision and the engine's real runtime label. */
function onRevision<T extends { payload: string | null }>(r: T): T {
  const o = JSON.parse(r.payload!);
  if (o.challengeRevision) o.challengeRevision = revision;
  if (o.type === "practice.opened") o.data.runtime = runtime;
  return { ...r, payload: JSON.stringify(o), ...("challenge_revision" in r && (r as any).challenge_revision ? { challenge_revision: revision } : {}) };
}
const browsers = (n: number, prefix = "b"): Event[] => many(n, prefix).map(onRevision);

/** The viewer's own attempts, from the real producer: their capture records through localHistory. */
const viewerAttempts = (): ReportAttempt[] =>
  localHistory({
    settings: { participantId: "synthetic-participant" },
    records: trace("viewer-attempt", "viewer-source", "JS-001", revision).map(onRevision),
    outbox: [],
  }).map((a) => ({ ...a, source: "device" as const }));

function environment(events: Event[], excluded: Set<string> = new Set()) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE challenge_heads(challenge_key TEXT,lifecycle TEXT,published_revision TEXT);CREATE TABLE published_versions(challenge_key TEXT,revision TEXT,metadata_json TEXT,published_at TEXT,object_key TEXT,runtime_fingerprint TEXT);",
  );
  const objectKey = `published/revisions/${revision.slice(7)}.json`;
  db.prepare("INSERT INTO challenge_heads VALUES(?,?,?)").run("JS-001", "published", revision);
  db.prepare("INSERT INTO published_versions VALUES(?,?,?,?,?,?)").run(
    "JS-001",
    revision,
    JSON.stringify({ key: "JS-001", title: "Synthetic Sum", summary: "Fixture", difficulty: "easy", tags: [], revision }),
    "2026-10-01T00:00:00.000Z",
    objectKey,
    "synthetic",
  );
  // Private R2 stand-in with ETags and R2's conditional-put semantics.
  const objects = new Map<string, { text: string; etag: string }>([[objectKey, { text: JSON.stringify(source), etag: "e0" }]]);
  let etags = 0;
  const CONTENT = {
    get: async (key: string) => {
      const o = objects.get(key);
      return o ? { size: Buffer.byteLength(o.text), etag: o.etag, text: async () => o.text } : null;
    },
    put: async (key: string, text: string, options?: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } }) => {
      const held = objects.get(key);
      const onlyIf = options?.onlyIf as { etagMatches?: string; etagDoesNotMatch?: string } | undefined;
      if (onlyIf?.etagDoesNotMatch === "*" && held) return null;
      if (onlyIf?.etagMatches !== undefined && held?.etag !== onlyIf.etagMatches) return null;
      const etag = `e${++etags}`;
      objects.set(key, { text, etag });
      return { etag };
    },
  };
  const CATALOG_DB: any = {
    prepare(query: string) {
      let values: unknown[] = [];
      const s = {
        bind: (...v: unknown[]) => ((values = v), s),
        first: async () => db.prepare(query).get(...(values as any[])) ?? null,
        all: async () => ({ results: db.prepare(query).all(...(values as any[])) }),
      };
      return s;
    },
  };
  let generation = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const COMPARISON_ELIGIBILITY = {
    generation: async () => generation,
    // The ingest check: a revision for an acknowledged adult non-stealth browser, else null.
    check: async (ids: string[]) => ids.map((id) => (excluded.has(id) ? null : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")),
    authorize: async (g: string) => g === generation,
  };
  let queries = 0;
  /** The Basin endpoint, stood in by running the posted SQL itself over the synthetic events. */
  const basin: typeof fetch = async (_url, init) => {
    queries++;
    const sql = JSON.parse(String(init!.body)).query as string;
    const script = `import sqlite3,json,sys
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.execute('CREATE TABLE events ('+', '.join(x+' TEXT' for x in v['fields'])+')')
c.executemany('INSERT INTO events VALUES ('+','.join('?' for x in v['fields'])+')', [[r.get(x) for x in v['fields']] for r in v['rows']])
def get(doc,key):
 try:
  d=json.loads(doc); return d.get(key) if isinstance(d,dict) else None
 except: return None
c.create_function('json_get_json',2,lambda doc,key: None if get(doc,key) is None else json.dumps(get(doc,key),separators=(',',':')))
c.create_function('json_get_str',2,lambda doc,key: get(doc,key) if isinstance(get(doc,key),str) else None)
print(json.dumps([dict(r) for r in c.execute(v['sql'].replace('default.events','events'))]))`;
    const out = spawnSync("python3", ["-c", script], { input: JSON.stringify({ rows: events, fields, sql }), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    assert.equal(out.status, 0, out.stderr);
    return Response.json({ success: true, result: { rows: JSON.parse(out.stdout) } });
  };
  const env: HumanSummaryEnvironment = {
    HUMAN_SUMMARY_CACHE_ENABLED: "true",
    ADMIN_STATS_SQL_TOKEN: "synthetic-token",
    CATALOG_DB,
    CONTENT,
    COMPARISON_ELIGIBILITY,
  };
  /** One `/api/cohort` request: the read it answers, after letting its background build finish. */
  const request = async (at = now) => {
    const work: Promise<unknown>[] = [];
    const read = await humanSummaryOnRequest(env, "JS-001", revision, runtime, (w) => work.push(w), at, basin);
    const built = await Promise.all(work);
    return { read, built };
  };
  return {
    env,
    request,
    objects,
    get queries() {
      return queries;
    },
    advance() {
      generation = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    },
    close: () => db.close(),
  };
}

/** What Stats shows for these reads, through the real bridge and report. */
function stats(read: CohortRead | null) {
  const attempts = viewerAttempts();
  const requests = comparisonRequests(attempts, catalog);
  const key = pairKey({ challenge: "JS-001", revision });
  const c = comparisons(attempts, catalog, adult, requests, {
    cohorts: read ? { [key]: read } : { [key]: "unavailable" },
    receipts: {},
    lengths: {},
  });
  const report = buildReport({ catalog, progress: {}, attempts, profile: adult.profile, comparisons: c });
  return { requests, c, report, html: renderToStaticMarkup(createElement(ReportBody, { report, status: null })) };
}

test("producer → 20 eligible browsers → cache → /api/cohort → Stats shows one named line", async () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1"; // the bridge's dev-only switch; the build flag stays off
  const f = environment(browsers(20));
  try {
    const attempts = viewerAttempts();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].practice, "unknown", "the producer never claims a first attempt");
    // First request: a miss answers at once with nothing, and one bounded build runs afterwards.
    const first = await f.request();
    assert.equal(first.read, null);
    assert.deepEqual(first.built, [true]);
    assert.equal(f.queries, 1, "one member query");
    // Next request: served from the private snapshot, no SQL.
    const second = await f.request();
    assert.equal(second.read?.state, "ready");
    assert.equal(f.queries, 1);
    const s = stats(second.read);
    assert.deepEqual(s.requests.cohorts, [{ challenge: "JS-001", revision }]);
    assert.equal(s.c.human.state, "shown");
    assert.match(
      s.html,
      /Among first attempts at Synthetic Sum \(current version, same runtime and editor setup\) from 20–49 browsers, about \d+% of scored first submissions passed\./,
    );
    // Aggregate only, in storage and in the response.
    for (const v of [JSON.stringify(second.read), ...[...f.objects.values()].map((o) => o.text)])
      assert.doesNotMatch(v, /participant_id|"b\d+"|synthetic-token/);
  } finally {
    f.close();
  }
});

test("one build per revision per hour, across concurrent requests; a failed hour isn't retried", async () => {
  const f = environment(browsers(20));
  try {
    const [a, b] = await Promise.all([f.request(), f.request()]);
    assert.deepEqual([...a.built, ...b.built].sort(), [false, true], "only one claimant builds");
    assert.equal(f.queries, 1);
  } finally {
    f.close();
  }
  const g = environment(browsers(19));
  try {
    await g.request();
    await g.request();
    assert.equal(g.queries, 1, "19 browsers: no snapshot, and no second query this hour");
    assert.equal(stats((await g.request()).read).c.human.state, "omitted");
  } finally {
    g.close();
  }
});

test("fail closed: CONTROL exclusion, invalidation after a privacy change, and expiry", async () => {
  process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW = "1";
  const excluded = environment(browsers(20), new Set(["b0"]));
  try {
    await excluded.request();
    const r = await excluded.request();
    const s = stats(r.read);
    assert.deepEqual([s.c.human.state, (s.c.human as any).reason], ["omitted", "too-few"]);
    assert.doesNotMatch(s.html, /Among first attempts/);
  } finally {
    excluded.close();
  }
  const f = environment(browsers(20));
  try {
    await f.request();
    assert.equal((await f.request()).read?.state, "ready");
    // An acknowledged privacy change: the old snapshot is never served again.
    f.advance();
    const after = await f.request();
    assert.equal(after.read, null);
    assert.equal(stats(after.read).c.human.state, "omitted");
    // Older than an hour: not served; within the same hour no second build runs.
    const key = [...f.objects.keys()].find((k) => k.includes("/humans/") && !k.includes("/leases/"))!;
    const snap = JSON.parse(f.objects.get(key)!.text);
    snap.computedAt = new Date(Date.now() - 3_600_001).toISOString();
    snap.expiresAt = new Date(Date.now() - 1).toISOString();
    f.objects.set(key, { text: JSON.stringify(snap), etag: "stale" });
    assert.equal((await f.request()).read, null);
  } finally {
    f.close();
  }
});
