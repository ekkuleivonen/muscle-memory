import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { trace, syntheticRevision } from "../developer-profile/fixtures";
import { ADULT, browser, fields, many, profile, type Event } from "./cohort-fixtures";
import { deriveAttempts } from "../developer-profile/derive";
import { cohortQuery, cohortResult, matchingGroup, COHORTS_ENABLED, MIN_COHORT } from "./cohort";

/** Runs the actual fixed SELECT in SQLite; only the namespace is adapted. Not a live Basin proof. */
function run(events: Event[], challenge = "JS-001", revision = syntheticRevision) {
  const script = `import sqlite3,json,sys
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.execute('CREATE TABLE events ('+', '.join(x+' TEXT' for x in v['fields'])+')')
c.executemany('INSERT INTO events VALUES ('+','.join('?' for x in v['fields'])+')', [[r.get(x) for x in v['fields']] for r in v['rows']])
def get(doc,key):
 try: return json.loads(doc).get(key)
 except: return None
c.create_function('json_get_json',2,lambda doc,key: None if get(doc,key) is None else json.dumps(get(doc,key),separators=(',',':')))
c.create_function('json_get_str',2,lambda doc,key: get(doc,key) if isinstance(get(doc,key),str) else None)
print(json.dumps([dict(r) for r in c.execute(v['sql'].replace('default.events','events'))]))`;
  const out = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ rows: events, fields, sql: cohortQuery(challenge, revision) }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}

test("cohorts stay switched off until the policy is approved", () => {
  assert.equal(COHORTS_ENABLED, false);
  assert.equal(MIN_COHORT, 20);
});

test("a group of enough browsers publishes rounded shares and submission quantiles only", () => {
  const rows = run(many(25));
  const result = cohortResult(rows);
  assert.equal(result.groups.length, 1);
  const [g] = result.groups;
  assert.deepEqual(g.runtime, { engine: "javascript", version: "synthetic" });
  assert.equal(g.practice, "first");
  assert.equal(g.participants, "20–49");
  assert.equal(g.solved, 1);
  assert.equal(g.firstTry, 0, "the fixture's first submission fails");
  assert.deepEqual(g.submissions, { p25: 2, p50: 2, p75: 2 });
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /"b\d+"|participantId|attempt_id|attemptId|record_id|payload/, "no identifiers or rows leave the server");
});

test("a group below the minimum is withheld entirely, not shown as small or zero", () => {
  assert.deepEqual(cohortResult(run(many(MIN_COHORT - 1))).groups, []);
  assert.equal(cohortResult(run(many(MIN_COHORT))).groups.length, 1);
});

test("current stealth and the 16–17 band remove a browser's whole history, by its latest profile", () => {
  const events = many(25);
  for (let i = 0; i < 6; i++) events.push(profile(`b${i}`, { ...ADULT, stealth: true }, "2026-10-26T00:00:00.000Z"));
  assert.deepEqual(cohortResult(run(events)).groups, [], "25 − 6 stealth = 19 < 20");
  // A later profile turning stealth off counts the browser again; latest wins.
  for (let i = 0; i < 6; i++) events.push(profile(`b${i}`, ADULT, "2026-10-27T00:00:00.000Z"));
  assert.equal(cohortResult(run(events)).groups.length, 1);
  const minors = many(25);
  for (let i = 0; i < 6; i++) minors.push(profile(`b${i}`, { age: "16-17", stealth: false }, "2026-10-26T00:00:00.000Z"));
  assert.deepEqual(cohortResult(run(minors)).groups, []);
});

test("duplicate copies count once; conflicting copies and model actors are left out", () => {
  const events = many(20);
  assert.equal(cohortResult(run([...events, ...events])).groups[0].participants, "20–49");
  const models = Array.from({ length: 5 }, (_, i) => [...browser(`m${i}`, "a", { actor: "model" }), profile(`m${i}`, ADULT, "2026-10-01T00:00:00.000Z")]).flat();
  assert.deepEqual(cohortResult(run([...many(19, "p"), ...models])).groups, [], "models never fill a human group");
  const conflicted = many(20);
  const started = conflicted.findIndex((e) => e.type === "practice.started");
  conflicted.push({ ...conflicted[started], payload: conflicted[started].payload!.replace('"direct"', '"picker"') });
  assert.deepEqual(cohortResult(run(conflicted)).groups, [], "a conflicted start leaves that attempt unstarted, so 19 remain");
});

test("first attempts and repeats are separate groups with one attempt per browser each", () => {
  const events = Array.from({ length: 22 }, (_, i) => [
    profile(`r${i}`, ADULT, "2026-10-01T00:00:00.000Z"),
    ...browser(`r${i}`, "a"),
    ...browser(`r${i}`, "b", { again: true, at: 86400000 }),
    ...browser(`r${i}`, "c", { again: true, at: 2 * 86400000 }),
  ]).flat();
  const groups = cohortResult(run(events)).groups;
  assert.deepEqual(groups.map((g) => [g.practice, g.participants]).sort(), [
    ["first", "20–49"],
    ["repeat", "20–49"],
  ]);
});

test("other revisions never leak into a cohort", () => {
  const other = many(25).map((e) => ({ ...e, challenge_revision: e.challenge_revision ? `sha256:${"b".repeat(64)}` : null }));
  assert.deepEqual(cohortResult(run(other)).groups, []);
  assert.throws(() => cohortQuery("JS-001' OR 1=1 --", syntheticRevision));
  assert.throws(() => cohortQuery("JS-001", "sha256:short"));
});

test("an attempt matches only the group with its exact runtime, diagnostics and practice", () => {
  const read = cohortResult(run(many(25)));
  const attempt = deriveAttempts(trace(), "synthetic-participant")[0];
  assert.ok(matchingGroup(read, attempt.conditions, "first"));
  assert.equal(matchingGroup(read, attempt.conditions, "repeat"), null);
  assert.equal(matchingGroup(read, ['Runtime: {"engine":"python"}', attempt.conditions[0]], "first"), null);
  assert.equal(matchingGroup(read, [], "first"), null, "unknown conditions never borrow a group");
});

test("unknown age, stealth, consent or start origin is never counted as an eligible adult", () => {
  const read = cohortResult(run(many(25)));
  assert.equal(read.eligibility.unit, "distinct browsers, not people");
  assert.match(read.eligibility.ages, /adults only/);
  const withSix = (extra: (i: number) => Event[]) => [...many(19), ...Array.from({ length: 6 }, (_, i) => extra(i)).flat()];
  const cases: [string, Event[]][] = [
    ["no profile uploaded", withSix((i) => browser(`x${i}`))],
    ["no age answer", withSix((i) => [...browser(`x${i}`), profile(`x${i}`, { stealth: false }, "2026-10-01T00:00:00.000Z")])],
    ["stealth not recorded", withSix((i) => [...browser(`x${i}`), profile(`x${i}`, { age: "25-34" }, "2026-10-01T00:00:00.000Z")])],
    ["an adult band answered earlier, unanswered now", withSix((i) => [...browser(`x${i}`), profile(`x${i}`, ADULT, "2026-10-01T00:00:00.000Z"), profile(`x${i}`, { stealth: false }, "2026-10-02T00:00:00.000Z")])],
    ["no Terms version on the records", withSix((i) => [...browser(`x${i}`, "a", { noTerms: true }), profile(`x${i}`, ADULT, "2026-10-01T00:00:00.000Z")])],
    ["a start without a recorded origin", withSix((i) => [...browser(`x${i}`, "a", { noOrigin: true }), profile(`x${i}`, ADULT, "2026-10-01T00:00:00.000Z")])],
  ];
  for (const [name, events] of cases) assert.deepEqual(cohortResult(run(events)).groups, [], `${name}: 19 eligible stay withheld`);
});
