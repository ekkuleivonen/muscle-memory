/**
 * The whole human comparison path on producer-shaped synthetic data: 20 browsers' recorded
 * practice (the real capture trace) → the fixed member SQL (SQLite stand-in for Basin) → CONTROL
 * member checks → snapshot build → serving with generation authorization → `humanFyi` on the
 * viewer's own derived attempt. No player data; not a live Basin proof.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { trace, syntheticRevision } from "../developer-profile/fixtures";
import { deriveAttempts } from "../developer-profile/derive";
import { many, fields, syntheticWindow, type Event } from "./cohort-fixtures";
import { cohortMemberQuery } from "./current-cohort";
import { buildHumanSnapshot, serveHumanSnapshot, type ComparisonControl } from "./human-snapshot";
import { humanFyi } from "./human-fyi";

const runtime = { engine: "javascript", version: "synthetic" };
const spec = { challenge: "JS-001", revision: syntheticRevision, window: syntheticWindow, runtime };
const catalog = [{ key: "JS-001", revision: syntheticRevision, title: "Synthetic Sum" }];
const adult = { age: "25-34", stealth: false };
const acknowledged = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const built = new Date(Date.parse(syntheticWindow.to) + 60_000);

/** The member SQL over these events in SQLite, with stand-ins for Basin's JSON functions. */
function memberRows(events: Event[]): unknown[] {
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
  const out = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ rows: events, fields, sql: cohortMemberQuery("JS-001", syntheticRevision, syntheticWindow) }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}
/** CONTROL as the ingest check answers it: a revision for eligible browsers, null for the rest. */
function control(excluded: Set<string> = new Set()) {
  let generation = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const c: ComparisonControl & { advance(): void } = {
    generation: async () => generation,
    check: async (ids) => ids.map((id) => (excluded.has(id) ? null : acknowledged)),
    authorize: async (g) => g === generation,
    advance: () => {
      generation = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    },
  };
  return c;
}
/** The viewer's own attempt, derived from the same capture trace the producer uploads. */
const [viewerAttempt] = deriveAttempts(trace(), "synthetic-participant");
const fyi = (read: Awaited<ReturnType<typeof serveHumanSnapshot>>) =>
  humanFyi(
    [viewerAttempt],
    catalog,
    adult,
    [{ challenge: "JS-001", revision: syntheticRevision, read: read ?? "unavailable" }],
    true,
  );

async function pipeline(events: Event[], c = control()) {
  const snapshot = await buildHumanSnapshot(spec, async () => memberRows(events), c, built);
  const read = await serveHumanSnapshot(snapshot, spec, c, new Date(+built + 60_000));
  return { snapshot, read, c };
}

test("20 eligible synthetic browsers: one named, aggregate-only line on the viewer's real solve", async () => {
  assert.equal(viewerAttempt.practice, "unknown", "derived history never claims a first attempt");
  const { snapshot, read } = await pipeline(many(20));
  assert.ok(snapshot && read);
  const result = fyi(read);
  assert.equal(result.state, "shown");
  if (result.state !== "shown") return;
  assert.equal(result.fyi.browsers, "20–49");
  assert.match(
    result.fyi.text,
    /^Among first attempts at Synthetic Sum \(current version, same runtime and editor setup\) from 20–49 browsers, about \d+% of scored first submissions passed\.$/,
  );
  // Nothing identifying survives into the stored snapshot or the public read.
  for (const value of [snapshot, read])
    assert.doesNotMatch(JSON.stringify(value), /participant_id|"b\d+"|aaaaaaaa-aaaa/);
});

test("fail closed: 19 browsers, CONTROL exclusions, invalidation, expiry and a wrong revision", async () => {
  assert.equal(fyi((await pipeline(many(19))).read).state, "omitted", "19 < 20");
  // CONTROL excludes one of 20 (missing, pending, unknown age, 16–17, stealth or deleted all answer null).
  const one = await pipeline(many(20), control(new Set(["b0"])));
  assert.deepEqual(fyi(one.read), { state: "omitted", reason: "too-few", action: { label: "Review comparison settings", href: "/settings/privacy" } });
  // An acknowledged privacy change after the build: the snapshot is no longer servable.
  const ok = await pipeline(many(20));
  ok.c.advance();
  assert.equal(await serveHumanSnapshot(ok.snapshot, spec, ok.c, new Date(+built + 60_000)), null);
  // Older than its one-hour lifetime: not served, no stale fallback.
  assert.equal(await serveHumanSnapshot(ok.snapshot, spec, control(), new Date(+built + 3_600_001)), null);
  // A read for another revision is never applied to this attempt.
  const other = `sha256:${"b".repeat(64)}`;
  const wrong = humanFyi([viewerAttempt], catalog, adult, [{ challenge: "JS-001", revision: other, read: ok.read! }], true);
  assert.deepEqual([wrong.state, (wrong as any).reason], ["omitted", "unavailable"]);
  // A privacy change during the member checks rejects the build outright.
  let calls = 0;
  const flipping = control();
  flipping.check = async (ids) => ids.map((_, i) => (++calls > 20 && i === 0 ? null : acknowledged));
  await assert.rejects(() => buildHumanSnapshot(spec, async () => memberRows(many(20)), flipping, built));
});
