/**
 * Test-only (never imported by the app): an in-memory stand-in for the web Worker's bindings
 * behind the on-demand human path. D1 and the private R2 bucket (with ETags and conditional puts),
 * the CONTROL eligibility RPC, and the Basin endpoint, which runs the posted SQL itself in SQLite
 * over the given synthetic events. Used by the Stats acceptance test and the browser check.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fields, type Event } from "./cohort-fixtures";
import { humanSummaryOnRequest, type HumanSummaryEnvironment } from "./scheduled-cohorts";

/** A capture record or event moved onto `revision`, with practice.opened on `runtime`. */
export function onRevision<T extends Record<string, any>>(r: T, revision: string, runtime: Record<string, string>): T {
  const o = JSON.parse(r.payload);
  if (o.challengeRevision) o.challengeRevision = revision;
  if (o.type === "practice.opened") o.data.runtime = runtime;
  return { ...r, payload: JSON.stringify(o), ...(r.challenge_revision ? { challenge_revision: revision } : {}) };
}

export function humanEnvironment(o: {
  events: Event[];
  challenge: string;
  revision: string;
  /** The immutable revision object and its display metadata, as published. */
  source: unknown;
  metadata: unknown;
  runtime: Record<string, string>;
  excluded?: Set<string>;
  publishedAt?: string;
}) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE challenge_heads(challenge_key TEXT,lifecycle TEXT,published_revision TEXT);CREATE TABLE published_versions(challenge_key TEXT,revision TEXT,metadata_json TEXT,published_at TEXT,object_key TEXT,runtime_fingerprint TEXT);",
  );
  const objectKey = `published/revisions/${o.revision.slice(7)}.json`;
  db.prepare("INSERT INTO challenge_heads VALUES(?,?,?)").run(o.challenge, "published", o.revision);
  db.prepare("INSERT INTO published_versions VALUES(?,?,?,?,?,?)").run(
    o.challenge,
    o.revision,
    JSON.stringify(o.metadata),
    o.publishedAt ?? "2026-10-01T00:00:00.000Z",
    objectKey,
    "synthetic",
  );
  const objects = new Map<string, { text: string; etag: string }>([[objectKey, { text: JSON.stringify(o.source), etag: "e0" }]]);
  let etags = 0;
  const CONTENT = {
    get: async (key: string) => {
      const v = objects.get(key);
      return v ? { size: Buffer.byteLength(v.text), etag: v.etag, text: async () => v.text } : null;
    },
    put: async (key: string, text: string, options?: { onlyIf: { etagMatches: string } | { etagDoesNotMatch: string } }) => {
      const held = objects.get(key);
      const onlyIf = options?.onlyIf as { etagMatches?: string; etagDoesNotMatch?: string } | undefined;
      if (onlyIf?.etagDoesNotMatch === "*" && held) return null;
      if (onlyIf?.etagMatches !== undefined && held?.etag !== onlyIf.etagMatches) return null;
      objects.set(key, { text, etag: `e${++etags}` });
      return {};
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
  const excluded = o.excluded ?? new Set<string>();
  const COMPARISON_ELIGIBILITY = {
    generation: async () => generation,
    // As the ingest check answers: a revision for an acknowledged adult non-stealth browser, else null.
    check: async (ids: string[]) => ids.map((id) => (excluded.has(id) ? null : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")),
    authorize: async (g: string) => g === generation,
  };
  let queries = 0;
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
    const out = spawnSync("python3", ["-c", script], { input: JSON.stringify({ rows: o.events, fields, sql }), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
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
  return {
    env,
    objects,
    basin,
    get queries() {
      return queries;
    },
    /** One /api/cohort request; `background` receives the build, as waitUntil would. */
    request(now: Date, background: (work: Promise<unknown>) => void = () => {}) {
      return humanSummaryOnRequest(env, o.challenge, o.revision, o.runtime, background, now, basin);
    },
    advance() {
      generation = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    },
    close: () => db.close(),
  };
}
