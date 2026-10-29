import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statsQuery, statsWindow } from "./query";
import { statsResult, completionRate } from "./result";
import { readStatistics } from "./read";
import { syntheticRevisions } from "./exclusions";

const revision = "sha256:" + "a".repeat(64),
  otherRevision = "sha256:" + "b".repeat(64);
const window = statsWindow({ from: "2026-10-20", to: "2026-10-26" });
const fields = [
  "record_id",
  "type",
  "capture_version",
  "participant_id",
  "attempt_id",
  "challenge",
  "challenge_revision",
  "occurred_at",
  "received_at",
  "kind",
  "payload",
];
let n = 0;
function observation(type: string, overrides: Record<string, unknown> = {}) {
  return {
    record_id: "record-" + ++n,
    type,
    capture_version: "practice-capture-1.1.0",
    participant_id: "browser-a",
    attempt_id: "attempt-a",
    challenge: "PY-003",
    challenge_revision: revision,
    occurred_at: "2026-10-21T12:00:00.000Z",
    received_at: "2026-10-21T12:00:01.000Z",
    kind: "observation",
    payload: JSON.stringify({
      type,
      data: { runId: "run-a", status: "queued" },
    }),
    ...overrides,
  };
}
/** Executes the actual fixed SELECT locally: only the table namespace is adapted for SQLite.
 * JSON and regexp functions mirror the documented Basin functions. This is not a live SQL proof.
 */
function query(
  rows: ReturnType<typeof observation>[],
  w = window,
  exclusions: { challenge: string; revision: string }[] = [],
) {
  const script = `import sqlite3,json,sys,re
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.execute('CREATE TABLE events ('+', '.join(x+' TEXT' for x in v['fields'])+')')
c.executemany('INSERT INTO events VALUES ('+','.join('?' for x in v['fields'])+')', [[r.get(x) for x in v['fields']] for r in v['rows']])
def get(doc,key):
 try: return json.loads(doc).get(key)
 except: return None
c.create_function('json_get_json',2,lambda doc,key: json.dumps(get(doc,key)))
c.create_function('json_get_str',2,lambda doc,key: get(doc,key) if isinstance(get(doc,key),str) else None)
c.create_function('regexp_like',2,lambda s,p: bool(re.search(p,s)) if s else False)
print(json.dumps([dict(r) for r in c.execute(v['sql'].replace('default.events','events'))]))`;
  const run = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ rows, fields, sql: statsQuery(w, exclusions) }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const expected = JSON.parse(run.stdout);
  // SQLite accepts duplicate unnamed UNION projections that Basin/DataFusion rejects.
  // STATS_SQL_PYTHON enables physical execution with DataFusion-compatible planning.
  if (process.env.STATS_SQL_PYTHON) {
    const physical = spawnSync(
      process.env.STATS_SQL_PYTHON,
      ["tools/statistics-query-check.py"],
      {
        input: JSON.stringify({ rows, fields, sql: statsQuery(w, exclusions) }),
        encoding: "utf8",
      },
    );
    assert.equal(physical.status, 0, physical.stderr);
    const normalize = (value: Record<string, unknown>[]) =>
      value.map((row) => JSON.stringify(Object.entries(row).sort())).sort();
    assert.deepEqual(
      normalize(JSON.parse(physical.stdout)),
      normalize(expected),
    );
  }
  return statsResult(expected);
}
test(
  "DataFusion rejects the former repeated unnamed NULL projections",
  {
    skip: !process.env.STATS_SQL_PYTHON,
  },
  () => {
    const previous = statsQuery(window).replace(
      "NULL AS observed, NULL AS duplicates, NULL AS conflicts, NULL AS known_synthetic,\n  NULL AS unsupported, NULL AS first_observed, NULL AS last_observed, NULL AS last_received,",
      "NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,",
    );
    assert.notEqual(previous, statsQuery(window));
    const run = spawnSync(
      process.env.STATS_SQL_PYTHON!,
      ["tools/statistics-query-check.py"],
      {
        input: JSON.stringify({ rows: [], fields, sql: previous }),
        encoding: "utf8",
      },
    );
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Projections require unique expression names/);
  },
);
test("only registered exact revisions explicitly tagged synthetic-qa are excluded", () => {
  const exclusions = syntheticRevisions([
    {
      challenge_key: "PY-003",
      revision,
      metadata_json: JSON.stringify({ tags: ["synthetic-qa"] }),
    },
    {
      challenge_key: "JS-999",
      revision,
      metadata_json: JSON.stringify({
        tags: ["arrays"],
        title: "Fast model operator test",
      }),
    },
  ]);
  assert.deepEqual(exclusions, [{ challenge: "PY-003", revision }]);
  const result = query(
    [
      observation("practice.started"),
      observation("practice.completed"),
      observation("practice.started", { challenge_revision: otherRevision }),
      observation("practice.started", { challenge: "JS-999" }),
    ],
    window,
    exclusions,
  );
  assert.equal(result.coverage.knownSynthetic, 2);
  assert.equal(result.rows.length, 2);
  assert.ok(
    result.rows.every(
      (row) => row.challenge !== "PY-003" || row.revision === otherRevision,
    ),
  );
  assert.throws(() =>
    syntheticRevisions([
      {
        challenge_key: "BAD'",
        revision,
        metadata_json: '{"tags":["synthetic-qa"]}',
      },
    ]),
  );
});
test("window rejects SQL injection, arrays, impossible dates and costly unbounded ranges", () => {
  for (const input of [
    { from: "2026-02-30" },
    { from: "2025-01-01", to: "2026-10-26" },
    { from: ["2026-10-20"] },
    { challenge: "PY-003' OR 1=1" },
    { revision: "a".repeat(64) },
  ])
    assert.throws(() => statsWindow(input));
  assert.equal(
    statsWindow({}, new Date("2026-10-26T23:00:00Z")).from,
    "2026-10-20",
  );
});
test("a clock-anomalous early completion does not hide a later matching completion", () => {
  const r = query([
    observation("practice.started"),
    observation("practice.completed", {
      occurred_at: "2026-10-21T11:00:00.000Z",
    }),
    observation("practice.completed", {
      occurred_at: "2026-10-21T13:00:00.000Z",
    }),
  ]);
  assert.equal(r.rows[0].completions, 1);
  assert.equal(r.rows[0].starts, 1);
});
test("actual query deduplicates deliveries, joins full attempt identity, and never adds browser IDs across revisions", () => {
  const start = observation("practice.started");
  const rows = [
    start,
    start,
    observation("practice.opened"),
    observation("practice.run"),
    observation("practice.run", {
      payload: JSON.stringify({ data: { runId: "run-a", status: "result" } }),
    }),
    observation("practice.submitted"),
    observation("practice.completed"),
    observation("practice.started", { attempt_id: "again" }),
    observation("practice.started", { participant_id: "browser-b" }),
    observation("practice.completed", { participant_id: "browser-b" }),
    observation("practice.started", { challenge_revision: otherRevision }),
    observation("practice.completed", { challenge_revision: otherRevision }),
  ];
  const r = query(rows);
  assert.equal(r.coverage.duplicates, 1);
  const a = r.rows.find((x) => x.revision === revision)!;
  assert.deepEqual(a, {
    challenge: "PY-003",
    revision,
    starts: 3,
    browserIds: 2,
    completions: 2,
    submissions: 1,
    runs: 1,
    missingStarts: 0,
  });
  assert.equal(completionRate(a), "66.7% (2/3)");
  assert.equal(r.rows.find((x) => x.revision === otherRevision)!.browserIds, 1);
  assert.equal(
    query(rows, { ...window, revision: otherRevision }).rows.length,
    1,
  );
});
test("missing starts, conflicting IDs, unknown capture, partial windows and missing run IDs are not fabricated passes", () => {
  const conflict = observation("practice.started", { attempt_id: "conflict" });
  const r = query([
    conflict,
    { ...conflict, payload: "changed" },
    observation("practice.started", {
      occurred_at: "2026-10-19T23:59:59.999Z",
    }),
    observation("practice.completed"), // start outside window: not in rate
    observation("practice.started", { attempt_id: "future" }),
    observation("practice.completed", {
      attempt_id: "future",
      occurred_at: "2026-10-27T00:00:00.000Z",
    }),
    observation("practice.started", {
      capture_version: "practice-capture-99.0.0",
    }),
    observation("practice.started", { capture_version: null }),
    observation("practice.submitted", { payload: "{}" }),
    observation("practice.started", { challenge: null }),
  ]);
  assert.equal(r.coverage.conflicts, 1);
  assert.equal(r.coverage.unsupported, 2);
  assert.equal(r.rows[0].starts, 1);
  assert.equal(r.rows[0].completions, 0);
  assert.equal(r.rows[0].missingStarts, 1);
  assert.equal(r.rows[0].submissions, 0);
  assert.equal(
    completionRate({ starts: 0, completions: 0 }),
    "Unavailable (no recorded starts)",
  );
});
test("empty snapshot is different from unavailable and projection strips private material", () => {
  const empty = query([]);
  assert.equal(empty.coverage.observed, 0);
  assert.deepEqual(empty.rows, []);
  assert.throws(() => statsResult([]));
  const raw = {
    scope: "coverage",
    observed: "0",
    duplicates: 0,
    conflicts: 0,
    known_synthetic: 0,
    unsupported: 0,
    first_observed: null,
    last_observed: null,
    last_received: null,
    payload: "PRIVATE",
    participant_id: "PRIVATE",
  };
  assert.ok(!JSON.stringify(statsResult([raw])).includes("PRIVATE"));
  assert.throws(() => statsResult([{ ...raw, observed: -1 }]));
  assert.throws(() => statsResult(Array(502).fill(raw)));
});
test("transport is one bounded SELECT, no retries, no redirects, no raw upstream errors", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(
      new URL(String(url)).hostname,
      "api.sql.cloudflarestorage.com",
    );
    assert.equal(options?.redirect, "manual");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal);
    assert.ok(JSON.parse(String(options?.body)).query.startsWith("WITH"));
    return Response.json({
      success: true,
      result: {
        rows: [
          {
            scope: "coverage",
            observed: 0,
            duplicates: 0,
            conflicts: 0,
            known_synthetic: 0,
            unsupported: 0,
            first_observed: null,
            last_observed: null,
            last_received: null,
          },
        ],
      },
    });
  };
  assert.deepEqual(
    (await readStatistics("fixture-not-a-credential", window, request)).rows,
    [],
  );
  assert.equal(calls, 1);
  await assert.rejects(readStatistics("", window, request));
  assert.equal(calls, 1);
  await assert.rejects(
    readStatistics("fixture", window, async () => {
      calls++;
      return new Response("PRIVATE", { status: 401 });
    }),
    /unavailable/,
  );
  await assert.rejects(
    readStatistics(
      "fixture",
      window,
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test" },
        }),
    ),
    /unavailable/,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    readStatistics(
      "fixture",
      window,
      async () => new Response("x".repeat(512 * 1024 + 1)),
    ),
    /too large/,
  );
});
