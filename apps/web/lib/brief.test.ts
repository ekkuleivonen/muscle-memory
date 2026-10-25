import { test } from "node:test";
import assert from "node:assert/strict";
import { briefOf } from "./brief";
import { pullRequestResult } from "../../../packages/domain/workspace";
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

test("completed on the first check: one sentence, then the tested code and hidden cases", () => {
  const brief = briefOf(facts())!;
  assert.equal(brief.headline, "All 12 cases passed on the first check.");
  assert.equal(brief.firstMissing, false);
  assert.deepEqual(ids(facts()), ["before-push", "hidden"]);
  assert.match(brief.items[0].text, /tested first, and passed/);
});

test("completed after a failing first check: the first result is kept apart from the latest", () => {
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
    "All 12 cases passed on check 3. On the first check, 7 of 12 cases passed.",
  );
  const errored = facts({
    pushes: 2,
    first: { ...f.first!, result: "checks-errored", passed: 0 },
  });
  assert.equal(
    briefOf(errored)!.headline,
    "All 12 cases passed on check 2. On the first check, the checks did not complete.",
  );
  // Pushed again after a review, the first push passing too.
  assert.equal(
    briefOf(facts({ pushes: 2 }))!.headline,
    "All 12 cases passed on check 2. The first check passed too.",
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
    "All 12 cases passed on check 2. What the first check showed isn't known.",
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
  assert.match(none.items[0].text, /the full check was the first/);
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
  assert.equal(briefOf(f)!.headline, "Every case passed on the first check.");
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

test("a first check that crashed or timed out part-way is 'did not complete', with no cause claimed", () => {
  const checks = Array.from({ length: 12 }, () => ({ expected: 1 }));
  for (const status of ["timeout", "runner-error"]) {
    // Five cases had run when it stopped.
    const recorded = pullRequestResult(checks, {
      status,
      phase: "tests",
      cases: Array.from({ length: 5 }, () => ({
        output: { text: "1", truncated: false },
      })),
    });
    assert.equal(recorded.result, "checks-errored");
    const f = facts({
      pushes: 2,
      first: {
        push: 1,
        ...recorded,
        legacy: false,
        visible: null,
        hidden: null,
      },
    });
    const brief = briefOf(f)!;
    assert.equal(
      brief.headline,
      "All 12 cases passed on check 2. On the first check, the checks did not complete.",
    );
    const all = describe(f)
      .flatMap((s) => s.items.map((i) => i.text))
      .join(" ");
    assert.doesNotMatch(
      `${brief.headline} ${all}`,
      /before any case|errored before (any|reaching)/,
    );
  }
});
