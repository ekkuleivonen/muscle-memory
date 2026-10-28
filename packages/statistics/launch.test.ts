import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { init, parse } from "@guanmingchiu/sqlparser-ts";
import { checkQuery, type SqlParse } from "../workbench/check";
import { launchQuery, launchWindow, type LaunchWindow } from "./launch";
import { announcedAt, asOf, attempt, fields, now, qaRevision, receipt, record, type Row } from "./launch-fixtures";

const window: LaunchWindow = { announcedAt, asOf, receipt, lookbackDays: 7 };
const synthetic = [{ challenge: "PY-900", revision: qaRevision }];

/** Runs the actual generated SELECT in SQLite; only the namespace is adapted. Not a live Basin proof. */
function run(rows: Row[], w = window) {
  const script = `import sqlite3,json,sys,re
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.execute('CREATE TABLE events ('+', '.join(x+' TEXT' for x in v['fields'])+')')
c.executemany('INSERT INTO events VALUES ('+','.join('?' for x in v['fields'])+')', [[r.get(x) for x in v['fields']] for r in v['rows']])
def get(doc,key):
 try:
  d=json.loads(doc)
  return d.get(key) if isinstance(d,dict) else None
 except: return None
c.create_function('json_get_json',2,lambda doc,key: None if get(doc,key) is None else json.dumps(get(doc,key),separators=(',',':')))
c.create_function('json_get_str',2,lambda doc,key: get(doc,key) if isinstance(get(doc,key),str) else None)
c.create_function('regexp_like',2,lambda s,p: bool(re.search(p,s)) if s else False)
print(json.dumps([dict(r) for r in c.execute(v['sql'].replace('default.events','events'))]))`;
  const out = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ rows, fields, sql: launchQuery(w, synthetic, now) }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout) as Record<string, string | number | null>[];
  const section = (s: string) => result.filter((r) => r.section === s);
  return { coverage: section("coverage")[0], launch: section("launch")[0], origin: section("origin"), challenge: section("challenge"), rows: result };
}

test("the announcement time is required and exact; nothing stands in for it", () => {
  const ok = { announcedAt, asOf, receipt };
  assert.throws(() => launchWindow({ asOf, receipt }, now), /announcement time is required.*no default/);
  assert.throws(() => launchWindow({ ...ok, announcedAt: "" }, now), /required/);
  for (const bad of ["2026-11-02", "2026-11-02T00:00:00Z", "2026-11-02T14:30:00.000+02:00", "2026-02-30T00:00:00.000Z", "now", "2026-11-02T14:30:00.000Z'--"])
    assert.throws(() => launchWindow({ ...ok, announcedAt: bad }, now), /exact UTC instant/, bad);
  assert.throws(() => launchWindow({ announcedAt, receipt }, now), /asOf is required/);
  assert.throws(() => launchWindow({ ...ok, asOf: announcedAt }, now), /after the announcement/);
  assert.throws(() => launchWindow({ ...ok, asOf: "2026-12-04T14:30:00.000Z" }, new Date("2027-01-01")), /at most 31 days/);
  assert.throws(() => launchWindow(ok, new Date(Date.parse(asOf) + 30 * 60000)), /an hour in the past/);
  for (const bad of [undefined, "", "http://example.com/a", "example.com", "https://example.com/a b"])
    assert.throws(() => launchWindow({ ...ok, receipt: bad }, now), /receipt/, String(bad));
  for (const bad of [0, 32, 1.5, "x"]) assert.throws(() => launchWindow({ ...ok, lookbackDays: bad }, now), /lookbackDays/);
  assert.deepEqual(launchWindow(ok, now), { ...window, lookbackDays: 7 });
  assert.throws(() => launchQuery(window, [{ challenge: "PY-003' OR '1'='1", revision: qaRevision }], now), /exact revisions/);
  assert.throws(() => launchQuery(window, [{ challenge: "PY-003", revision: "sha256:x" }], now), /exact revisions/);
});

test("the generated query passes the workbench's read-only check and names its parameters", async () => {
  await init();
  const parseSql: SqlParse = (sql) => parse(sql, "generic") as unknown[];
  const sql = launchQuery(window, synthetic, now);
  const checked = checkQuery(sql, parseSql);
  assert.equal(checked.kind, "select");
  assert.equal(checked.limited, true);
  assert.ok(sql.length < 20000, "fits the workbench's 20,000 characters");
  assert.match(sql, new RegExp(`Announcement ${announcedAt}, from ${receipt}`));
  assert.match(sql, /As of 2026-11-03T14:30:00.000Z; start records read from 2026-10-26T14:30:00.000Z/);
  assert.doesNotMatch(sql, /\bSELECT\s+\*\s+FROM\s+default/i, "never selects raw rows from the table");
});

test("empty data: a coverage row and a launch row of zeros, nothing else", () => {
  const r = run([]);
  assert.equal(r.rows.length, 2);
  assert.equal(Number(r.launch.attempts ?? 0), 0);
  assert.equal(r.origin.length, 0);
  assert.equal(r.challenge.length, 0);
});

test("only whole attempts that genuinely started at or after the announcement are counted", () => {
  const rows = [
    ...attempt("exact", 0, { browser: "b1" }), // starts exactly at the announcement
    ...attempt("post", 60, { browser: "b1", from: "link" }), // same browser, later
    ...attempt("post2", 90, { browser: "b2", complete: false }),
    // Started before launch, resumed and completed after it: never a launch attempt.
    ...attempt("resumed", -120, { browser: "b3" }).map((r, i) =>
      i < 2 ? r : { ...r, occurred_at: r.occurred_at!.replace("T12", "T17"), received_at: r.received_at!.replace("T12", "T17") },
    ),
    // Started offline before launch, uploaded after it: still before.
    ...attempt("offline", -3, { browser: "b4", received: 60 }),
    // The device clock says after, but it reached us before the announcement: it began before.
    ...attempt("skewed", 5, { browser: "b5", received: -1 }),
  ];
  const r = run(rows);
  assert.equal(r.launch.attempts, 3);
  assert.equal(r.launch.browser_ids, 2);
  assert.equal(r.launch.completed, 2);
  assert.equal(r.launch.submitted_attempts, 3);
  assert.equal(r.launch.submissions, 6);
  assert.equal(r.launch.runs, 3);
  assert.equal(r.launch.prelaunch_resumed, 3, "resumed, offline and skewed: activity after, start before");
  assert.deepEqual(
    r.origin.map((o) => [o.origin, o.attempts, o.completed]).sort(),
    [["link", 1, 1], ["picker", 2, 1]],
  );
  assert.deepEqual(r.challenge.map((c) => [c.challenge, c.attempts, c.browser_ids]), [["PY-003", 3, 2]]);
});

test("a prelaunch attempt with only resumed events after the boundary is not a new attempt", () => {
  const rows = [
    record("practice.started", "old", -60, { data: { from: "picker" } }),
    record("practice.submitted", "old", 30, { data: { runId: "x", result: "passed" } }),
    record("practice.completed", "old", 31),
  ];
  const r = run(rows);
  assert.equal(Number(r.launch.attempts), 0);
  assert.equal(r.launch.prelaunch_resumed, 1);
  assert.equal(r.challenge.length, 0);
});

test("a missing or unknowable start excludes the attempt and is reported, never inferred", () => {
  const rows = [
    // No start record at all: the first surviving event is not a start.
    record("practice.opened", "nostart", 10),
    record("practice.submitted", "nostart", 12, { data: { runId: "x", result: "passed" } }),
    record("practice.completed", "nostart", 13),
    // Its start is older than the lookback, so it is not read: missing, not counted.
    record("practice.started", "ancient", -8 * 1440, { data: { from: "picker" } }),
    record("practice.completed", "ancient", 20),
    // A start without its origin, and an attempt with two start records.
    ...attempt("noorigin", 30, { from: null }),
    ...attempt("twice", 40),
    record("practice.started", "twice", 41, { data: { from: "again" } }),
    // A conflicting copy anywhere in the attempt makes it not whole.
    ...(() => {
      const a = attempt("conflict", 50);
      return [...a, { ...a[3], payload: a[3].payload!.replace('"failed"', '"passed"') }];
    })(),
    ...attempt("good", 60),
  ];
  const r = run(rows);
  assert.equal(r.launch.attempts, 1);
  assert.equal(r.launch.missing_start, 2);
  assert.equal(r.launch.untrusted_start, 2);
  assert.equal(r.launch.conflicting_attempts, 1);
  assert.equal(r.coverage.conflicting_records, 1);
});

test("synthetic QA revisions and records without person consent are excluded and counted", () => {
  const rows = [
    ...attempt("qa", 10, { challenge: "PY-900", revision: qaRevision }),
    ...attempt("noterms", 20, { terms: null }),
    ...attempt("model", 30, { actor: "model" }),
    ...attempt("oldcapture", 40, { capture: "practice-capture-0.9.0" }),
    ...attempt("person", 50),
  ];
  const r = run(rows);
  assert.equal(r.launch.attempts, 1);
  assert.equal(r.coverage.synthetic_records, 6);
  assert.equal(r.coverage.ineligible_records, 18);
  assert.deepEqual(r.challenge.map((c) => c.challenge), ["PY-003"]);
});

test("as-of is stable: late arrivals are reported, never counted, until a later as-of", () => {
  const base = [...attempt("a", 60, { complete: false }), ...attempt("b", 120)];
  const late = [
    // Happened before the as-of, reached us after it.
    record("practice.completed", "a", 1380, { received: 1500 }),
    ...attempt("c", 1400, { received: 1450 }),
    // Happened after the as-of: outside this report entirely.
    ...attempt("d", 1460),
  ];
  const before = run(base),
    after = run([...base, ...late]);
  for (const k of ["attempts", "completed", "submissions", "runs", "browser_ids"] as const)
    assert.equal(after.launch[k], before.launch[k], k);
  assert.equal(after.coverage.observed_records, before.coverage.observed_records);
  assert.equal(Number(before.coverage.arrived_after_as_of), 0);
  assert.equal(after.coverage.arrived_after_as_of, 7);
  const later = run([...base, ...late], { ...window, asOf: "2026-11-03T23:00:00.000Z" });
  assert.equal(later.launch.attempts, 4);
  assert.equal(later.launch.completed, 4);
});

test("duplicate deliveries count once, and a device clock ahead of receipt is disclosed", () => {
  const a = attempt("dup", 10);
  const ahead = attempt("ahead", 30, { received: 29 });
  const r = run([...a, ...a.map((x) => ({ ...x, received_at: x.received_at!.replace(/\.\d+Z/, ".999Z") })), ...ahead]);
  assert.equal(r.launch.attempts, 2);
  assert.equal(r.launch.submissions, 4);
  assert.equal(r.coverage.duplicate_copies, 6);
  assert.equal(r.launch.clock_ahead_starts, 1);
});

test("output is aggregates only", () => {
  const r = run([...attempt("secret-attempt", 10, { browser: "secret-browser" })]);
  assert.doesNotMatch(JSON.stringify(r.rows), /secret-|synthetic-\d|payload/);
});
