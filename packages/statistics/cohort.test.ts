import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { trace, syntheticRevision } from "../developer-profile/fixtures";
import {
  syntheticWindow,
  ADULT,
  browser,
  fields,
  many,
  profile,
  type Event,
} from "./cohort-fixtures";
import { deriveAttempts } from "../developer-profile/derive";
import { cohortMemberQuery, currentCohort } from "./current-cohort";
import {
  cohortQuery,
  cohortResult,
  matchingGroup,
  COHORTS_ENABLED,
  MIN_COHORT,
} from "./cohort";

/** Runs the actual fixed SELECT in SQLite; only the namespace is adapted. Not a live Basin proof. */
function run(
  events: Event[],
  challenge = "JS-001",
  revision = syntheticRevision,
  window = syntheticWindow,
  build: typeof cohortQuery = cohortQuery,
) {
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
    input: JSON.stringify({
      rows: events,
      fields,
      sql: build(challenge, revision, window),
    }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}

test("human cohorts are on for activation; the floor stays 20", () => {
  // Activated for humans (ENG-376); models stay off separately.
  assert.equal(COHORTS_ENABLED, true);
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
  assert.doesNotMatch(
    text,
    /"b\d+"|participantId|attempt_id|attemptId|record_id|payload/,
    "no identifiers or rows leave the server",
  );
});

test("a group below the minimum is withheld entirely, not shown as small or zero", () => {
  assert.deepEqual(cohortResult(run(many(MIN_COHORT - 1))).groups, []);
  assert.equal(cohortResult(run(many(MIN_COHORT))).groups.length, 1);
});

test("uploaded profiles neither exclude nor admit: stealth, minor, unanswered or conflicting", () => {
  const plain = run(many(25));
  const withProfiles = (extra: (i: number) => Event[]) => {
    const events = many(25);
    for (let i = 0; i < 6; i++) events.push(...extra(i));
    return run(events);
  };
  const cases: [string, (i: number) => Event[]][] = [
    ["later stealth profiles", (i) => [profile(`b${i}`, { ...ADULT, stealth: true }, "2026-10-26T00:00:00.000Z")]],
    ["16–17 profiles", (i) => [profile(`b${i}`, { age: "16-17", stealth: false }, "2026-10-26T00:00:00.000Z")]],
    ["unanswered age", (i) => [profile(`b${i}`, { stealth: false }, "2026-10-26T00:00:00.000Z")]],
    [
      "conflicting profile copies",
      (i) => {
        const p = profile(`b${i}`, { ...ADULT, stealth: true }, "2026-10-26T00:00:00.000Z");
        return [p, { ...p, payload: p.payload!.replace('"stealth":true', '"stealth":false') }];
      },
    ],
  ];
  for (const [name, extra] of cases)
    assert.deepEqual(withProfiles(extra), plain, `${name} don't change the query's output`);
  // Browsers that never uploaded a profile are still returned, for the CONTROL check to decide.
  const bare = Array.from({ length: 25 }, (_, i) => browser(`n${i}`)).flat();
  assert.equal(cohortResult(run(bare)).groups.length, 1);
});

test("CONTROL alone decides: a profile can't override missing, pending, unknown, minor, stealth or deleted state", async () => {
  // 25 browsers whose uploaded profiles all say adult and not stealth.
  const members = run(many(25), "JS-001", syntheticRevision, syntheticWindow, cohortMemberQuery);
  assert.equal(new Set(members.map((r: { participant_id: string }) => r.participant_id)).size, 25);
  const acknowledged = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  // The ingest check (comparison-privacy.test.ts) returns a revision only for an acknowledged,
  // adult, non-stealth record with no tombstone; missing, pending, unknown, non-adult, stealth and
  // deleted all return null. Here the first `excluded` browsers are in any of those states.
  const control = (excluded: number) => ({
    check: async (ids: string[]) => ids.map((id) => (+id.slice(1) < excluded ? null : acknowledged)),
  });
  assert.equal((await currentCohort(async () => members, control(5))).groups.length, 1, "25 − 5 = 20");
  assert.deepEqual((await currentCohort(async () => members, control(6))).groups, [], "25 − 6 = 19");
  // The reverse: profiles saying stealth or 16–17 don't remove a browser CONTROL calls eligible.
  const contrary = many(25);
  for (let i = 0; i < 25; i++)
    contrary.push(profile(`b${i}`, { age: "16-17", stealth: true }, "2026-10-26T00:00:00.000Z"));
  const rows = run(contrary, "JS-001", syntheticRevision, syntheticWindow, cohortMemberQuery);
  assert.equal((await currentCohort(async () => rows, control(0))).groups[0].participants, "20–49");
});

test("duplicate copies count once; conflicting copies and model actors are left out", () => {
  const events = many(20);
  assert.equal(
    cohortResult(run([...events, ...events])).groups[0].participants,
    "20–49",
  );
  const models = Array.from({ length: 5 }, (_, i) => [
    ...browser(`m${i}`, "a", { actor: "model" }),
    profile(`m${i}`, ADULT, "2026-10-01T00:00:00.000Z"),
  ]).flat();
  assert.deepEqual(
    cohortResult(run([...many(19, "p"), ...models])).groups,
    [],
    "models never fill a human group",
  );
  const conflicted = many(20);
  const started = conflicted.findIndex((e) => e.type === "practice.started");
  conflicted.push({
    ...conflicted[started],
    payload: conflicted[started].payload!.replace('"direct"', '"picker"'),
  });
  assert.deepEqual(
    cohortResult(run(conflicted)).groups,
    [],
    "a conflicted start leaves that attempt unstarted, so 19 remain",
  );
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
  const other = many(25).map((e) => ({
    ...e,
    challenge_revision: e.challenge_revision
      ? `sha256:${"b".repeat(64)}`
      : null,
  }));
  assert.deepEqual(cohortResult(run(other)).groups, []);
  assert.throws(() =>
    cohortQuery("JS-001' OR 1=1 --", syntheticRevision, syntheticWindow),
  );
  assert.throws(() => cohortQuery("JS-001", "sha256:short", syntheticWindow));
});

test("an attempt matches only the group with its exact runtime, diagnostics and practice", () => {
  const read = cohortResult(run(many(25)));
  const attempt = deriveAttempts(trace(), "synthetic-participant")[0];
  assert.ok(matchingGroup(read, attempt.conditions, "first", "adult"));
  assert.equal(
    matchingGroup(read, attempt.conditions, "first", "unknown"),
    null,
  );
  assert.equal(
    matchingGroup(read, attempt.conditions, "first", "non-adult"),
    null,
  );
  assert.equal(
    matchingGroup(read, attempt.conditions, "repeat", "adult"),
    null,
  );
  assert.equal(
    matchingGroup(
      read,
      ['Runtime: {"engine":"python"}', attempt.conditions[0]],
      "first",
      "adult",
    ),
    null,
  );
  assert.equal(
    matchingGroup(read, [], "first", "adult"),
    null,
    "unknown conditions never borrow a group",
  );
});

test("records without consent or a recorded start origin are never counted", () => {
  const read = cohortResult(run(many(25)));
  assert.equal(read.eligibility.unit, "distinct browsers, not people");
  assert.match(read.eligibility.ages, /adults only/);
  const withSix = (extra: (i: number) => Event[]) => [
    ...many(19),
    ...Array.from({ length: 6 }, (_, i) => extra(i)).flat(),
  ];
  const cases: [string, Event[]][] = [
    ["no Terms version on the records", withSix((i) => browser(`x${i}`, "a", { noTerms: true }))],
    ["a start without a recorded origin", withSix((i) => browser(`x${i}`, "a", { noOrigin: true }))],
  ];
  for (const [name, events] of cases)
    assert.deepEqual(cohortResult(run(events)).groups, [], `${name}: 19 countable stay withheld`);
});

function editEvent(e: Event, change: (o: any) => void): Event {
  const o = JSON.parse(e.payload!);
  change(o);
  return { ...e, occurred_at: o.occurredAt, payload: JSON.stringify(o) };
}
test("first-try and finisher denominators suppress independently; unknown is not a failed check", () => {
  const unknown = many(20).map((e) =>
    e.participant_id === "b0" &&
    e.type === "practice.submitted" &&
    JSON.parse(e.payload!).data.runId === "r1"
      ? editEvent(e, (o) => {
          o.data.result = "errored";
          o.data.passed = 0;
          o.data.total = 0;
        })
      : e,
  );
  const g = cohortResult(run(unknown)).groups[0];
  assert.equal(g.firstTry, null);
  assert.equal(g.denominators.firstTry, null);
  assert.ok(g.submissions);
  assert.equal(g.denominators.submissions, "20–49");
  const incomplete = many(20).filter(
    (e) =>
      !(
        e.participant_id === "b0" &&
        ["practice.completed", "practice.answered"].includes(e.type!)
      ),
  );
  const h = cohortResult(run(incomplete)).groups[0];
  assert.equal(h.firstTry, 0);
  assert.equal(h.submissions, null);
  assert.equal(h.denominators.solved, "20–49");
  assert.equal(h.denominators.firstTry, "20–49");
  assert.equal(h.denominators.submissions, null);
});
test("a malformed decided first verdict with a valid later completion withholds the whole attempt", () => {
  for (const change of [
    (o: any) => {
      o.data.passed = -1;
    },
    (o: any) => {
      o.data.total = 0;
    },
    (o: any) => {
      o.data.rules = null;
    },
  ]) {
    const events = many(20).map((e) =>
      e.participant_id === "b0" &&
      e.type === "practice.submitted" &&
      JSON.parse(e.payload!).data.runId === "r1"
        ? editEvent(e, change)
        : e,
    );
    const rows = run(events);
    assert.equal(
      rows.reduce((n: number, r: { browsers: number }) => n + r.browsers, 0),
      19,
    );
    assert.deepEqual(cohortResult(rows).groups, []);
  }
});
test("submissions after solve are not counted as what the solve took", () => {
  const events = many(20);
  const extra = events
    .filter((e) => e.type === "practice.answered")
    .map((e) => {
      const o = JSON.parse(e.payload!);
      o.source.sequence++;
      o.observationId += "-post-solve";
      o.type = "practice.submitted";
      o.occurredAt = new Date(Date.parse(o.occurredAt) + 10000).toISOString();
      o.data = {
        runId: "post-solve",
        revision: 2,
        codeArtifactId: "synthetic-artifact",
        result: "passed",
        passed: 3,
        total: 3,
        rules: [],
      };
      return {
        ...e,
        type: o.type,
        record_id: o.observationId,
        occurred_at: o.occurredAt,
        payload: JSON.stringify(o),
      };
    });
  assert.deepEqual(
    cohortResult(run([...events, ...extra])).groups[0].submissions,
    { p25: 2, p50: 2, p75: 2 },
  );
});
test("exact editor features partition groups, changing tools or a capture gap withholds the attempt", () => {
  const other = many(20, "v").map((e) =>
    e.type === "practice.opened"
      ? editEvent(e, (o) => {
          o.data.editor.features.push("vim-keybindings");
        })
      : e,
  );
  const result = cohortResult(run([...many(20), ...other]));
  assert.equal(result.groups.length, 2);
  const gap = many(20).filter(
    (e) => !(e.participant_id === "b0" && e.type === "practice.edit"),
  );
  assert.deepEqual(cohortResult(run(gap)).groups, []);
  const missing = many(20).map((e) =>
    e.participant_id === "b0" && e.type === "practice.opened"
      ? editEvent(e, (o) => {
          delete o.data.editor;
        })
      : e,
  );
  assert.deepEqual(cohortResult(run(missing)).groups, []);
});
test("window edges do not invent firsts: only evidenced repeats survive a truncated history", () => {
  const events = Array.from({ length: 20 }, (_, i) => [
    profile(`w${i}`, ADULT, "2026-10-27T00:00:00.000Z"),
    ...browser(`w${i}`),
    ...browser(`w${i}`, "repeat", { again: true, at: 86400000 }),
  ]).flat();
  const window = { ...syntheticWindow, from: "2026-10-26T00:00:00.000Z" };
  const groups = cohortResult(
    run(events, "JS-001", syntheticRevision, window),
  ).groups;
  assert.deepEqual(
    groups.map((g) => g.practice),
    ["repeat"],
  );
  const late = events.map((e) => ({
    ...e,
    received_at: "2026-11-02T00:00:00.000Z",
  }));
  assert.deepEqual(cohortResult(run(late)).groups, []);
});
test("unsubmitted eligible starts remain in the observed-completion denominator", () => {
  const events = many(20).filter(
    (e) =>
      e.participant_id !== "b0" ||
      e.type === "site.profile" ||
      JSON.parse(e.payload!).source.sequence <= 2,
  );
  const g = cohortResult(run(events)).groups[0];
  assert.ok(g);
  assert.equal(g.participants, "20–49");
  assert.ok(
    Math.abs(g.solved - 0.95) < 1e-9,
    "LEFT JOIN absence remains a legitimate unfinished start",
  );
  assert.equal(g.firstTry, null);
  assert.equal(g.submissions, null);
});
