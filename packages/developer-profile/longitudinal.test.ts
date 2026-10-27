import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAttempts, type AttemptSummary } from "./derive";
import { trace } from "./fixtures";
import { repeatHistory } from "./longitudinal";
const until = "2026-10-27T00:00:00Z";
function attempt(id: string, date: string, elapsed: number): AttemptSummary {
  const a = deriveAttempts(trace(), "synthetic-participant")[0];
  return {
    ...a,
    attempt: id,
    practice: "repeat",
    started: date,
    values: { ...a.values, elapsed },
  };
}
const history = () => [
  attempt("a", "2026-09-03T00:00:00Z", 100),
  attempt("b", "2026-09-15T00:00:00Z", 300),
  attempt("c", "2026-10-01T00:00:00Z", 50),
  attempt("d", "2026-10-20T00:00:00Z", 150),
];
test("same task, revision, recorded runtime/tools and repeated practice yield descriptive windows", () => {
  const r = repeatHistory(history(), until);
  assert.equal(r.groups.length, 1);
  assert.equal(r.excluded, 0);
  assert.deepEqual(r.groups[0].metrics.elapsed, {
    earlier: { sample: 2, median: 200 },
    recent: { sample: 2, median: 100 },
  });
});
test("missing values are not zeroes; insufficient period samples withhold medians independently", () => {
  const rs = history();
  rs[0].values.inserted = null;
  const r = repeatHistory(rs, until);
  assert.equal(r.groups[0].metrics.inserted.earlier.sample, 1);
  assert.equal(r.groups[0].metrics.inserted.earlier.median, null);
  assert.equal(r.groups[0].metrics.elapsed.earlier.median, 200);
});
test("fresh/unknown, unfinished, gaps, mixed conditions and revisions never imply matched growth", () => {
  const rs = history();
  for (const transform of [
    (a: AttemptSummary) => ({ ...a, practice: "unknown" as const }),
    (a: AttemptSummary) => ({ ...a, completed: false }),
    (a: AttemptSummary) => ({ ...a, issues: ["capture gap"] }),
    (a: AttemptSummary) => ({ ...a, conditions: [] }),
  ])
    assert.equal(repeatHistory(rs.map(transform), until).groups.length, 0);
  rs[0].revision = `sha256:${"b".repeat(64)}`;
  rs[1].conditions = ["Editor: other", "Runtime: other"];
  const groups = repeatHistory(rs, until).groups;
  assert.equal(groups.length, 3);
  assert.ok(groups.every((g) => g.metrics.elapsed.earlier.median === null));
});
test("deduplication, conflict rejection, exact time boundaries and participant isolation", () => {
  const rs = history();
  assert.deepEqual(
    repeatHistory([...rs].reverse().concat(rs), until),
    repeatHistory(rs, until),
  );
  const conflict = { ...rs[0], values: { ...rs[0].values, elapsed: 999 } };
  assert.equal(
    repeatHistory([...rs, conflict], until).groups[0].metrics.elapsed.earlier
      .sample,
    1,
  );
  assert.equal(
    repeatHistory([...rs, { ...rs[0], participant: "another" }], until).groups
      .length,
    0,
  );
  const r = repeatHistory(
    [
      attempt("old", "2026-09-01T00:00:00Z", 1),
      attempt("edge", "2026-09-29T00:00:00Z", 2),
      attempt("end", until, 3),
    ],
    until,
  );
  assert.equal(r.excluded, 1);
  assert.equal(r.groups[0].earlier, 1);
  assert.equal(r.groups[0].recent, 1);
});
test("empty history and invalid time are explicit", () => {
  assert.equal(repeatHistory([], until).groups.length, 0);
  assert.throws(() => repeatHistory([], "invalid"));
});
