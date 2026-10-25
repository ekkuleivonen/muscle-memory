import { test } from "node:test";
import assert from "node:assert/strict";
import { briefOf } from "./brief";
import { describe, type EvidenceFacts } from "./evidence";

/** A merged pull request opened once, its tested code passing every check. */
function facts(over: Partial<EvidenceFacts> = {}): EvidenceFacts {
  const first = {
    push: 1,
    result: "checks-passed",
    passed: 12,
    total: 12,
    legacy: false,
    visible: { passed: 5, total: 5 },
    hidden: { passed: 7, total: 7 },
  };
  return {
    number: 1,
    state: "merged",
    pushes: 1,
    changed: [{ path: "solution.py", added: 4, removed: 1 }],
    checks: { result: "checks-passed", passed: 12, total: 12, legacy: false },
    visible: { passed: 5, total: 5 },
    hidden: { passed: 7, total: 7 },
    first,
    beforeLatest: { failedChecks: 0, reviews: 0 },
    verification: { runs: 3, green: 1, beforePush: "tested-passing" },
    recovery: {
      failedRuns: 2,
      erroredRuns: 0,
      failedPushes: 0,
      closedBefore: 0,
      findings: { raised: 0, byCode: 0, byReply: 0, byResolve: 0, open: 0 },
    },
    assistance: {
      hints: 0,
      comments: 0,
      editorFeatures: ["syntax-highlighting"],
      typeHelp: 0,
      pastes: 0,
    },
    timing: { active: 600, elapsed: 900, hidden: 0 },
    gaps: 0,
    stale: null,
    openRequired: 0,
    ...over,
  };
}

const ids = (f: EvidenceFacts) => briefOf(f)!.items.map((i) => i.id);

test("merged on the first push: one sentence, then the tested code and CI-only checks", () => {
  const brief = briefOf(facts())!;
  assert.equal(brief.headline, "All 12 checks passed on the first push.");
  assert.equal(brief.firstMissing, false);
  assert.deepEqual(ids(facts()), ["before-push", "hidden"]);
  assert.match(brief.items[0].text, /tested first, and passed/);
});

test("merged after a failing first submission: the first result is kept apart from the latest", () => {
  const f = facts({
    pushes: 3,
    first: {
      push: 1,
      result: "checks-failed",
      passed: 7,
      total: 12,
      legacy: false,
      visible: null,
      hidden: null,
    },
  });
  assert.equal(
    briefOf(f)!.headline,
    "All 12 checks passed on push 3. On the first push, 7 of 12 checks passed.",
  );
  const errored = facts({
    pushes: 2,
    first: { ...f.first!, result: "checks-errored", passed: 0 },
  });
  assert.equal(
    briefOf(errored)!.headline,
    "All 12 checks passed on push 2. On the first push, CI errored before reaching the tests.",
  );
  // Pushed again after a review, the first push passing too.
  assert.equal(
    briefOf(facts({ pushes: 2 }))!.headline,
    "All 12 checks passed on push 2. The first push passed too.",
  );
});

test("missing evidence is said, never filled in", () => {
  const f = facts({
    pushes: 2,
    first: null,
    changed: null,
    hidden: null,
    gaps: 2,
    verification: { runs: 2, green: 1, beforePush: "unknown" },
  });
  const brief = briefOf(f)!;
  assert.equal(
    brief.headline,
    "All 12 checks passed on push 2. What CI said on the first push isn't known.",
  );
  assert.equal(brief.firstMissing, true);
  assert.deepEqual(
    brief.items.map((i) => [i.id, i.status]),
    [
      ["before-push", "missing"],
      ["hidden", "missing"],
      ["gaps", "missing"],
    ],
  );
  // The code alone missing, without capture gaps.
  assert.deepEqual(ids(facts({ changed: null })), [
    "before-push",
    "hidden",
    "code",
  ]);
});

test("the tested artifact: code changed after its last run, or never run, is what the brief says", () => {
  const changed = briefOf(
    facts({ verification: { runs: 2, green: 2, beforePush: "changed-after" } }),
  )!;
  assert.match(changed.items[0].text, /differs from every test run/);
  const none = briefOf(
    facts({ verification: { runs: 0, green: 0, beforePush: "none" } }),
  )!;
  assert.equal(none.items[0].id, "runs");
  assert.match(none.items[0].text, /CI was the first check/);
});

test("the brief only repeats lines from the full evidence", () => {
  for (const f of [facts(), facts({ changed: null, gaps: 1, hidden: null })]) {
    const all = describe(f).flatMap((s) => s.items);
    for (const item of briefOf(f)!.items)
      assert.ok(all.some((i) => i.text === item.text));
  }
});

test("historical records: a legacy pass has no breakdown to claim", () => {
  const f = facts({
    checks: { result: "checks-passed", passed: 12, total: 12, legacy: true },
  });
  assert.equal(briefOf(f)!.headline, "CI passed on the first push.");
});

test("open, failing, stale and closed pull requests have no brief: the merge box says what is left", () => {
  const failing = facts({
    state: "open",
    checks: { result: "checks-failed", passed: 7, total: 12, legacy: false },
  });
  const stale = facts({
    state: "open",
    stale: {
      pending: false,
      codeChanged: true,
      codeUnconfirmed: false,
      revision: false,
    },
  });
  for (const f of [
    facts({ state: "open" }),
    failing,
    stale,
    facts({ state: "closed" }),
  ])
    assert.equal(briefOf(f), null);
});
