import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticRevision } from "../developer-profile/fixtures";
import { syntheticWindow } from "./cohort-fixtures";
import { cohortDiscoveryQuery, planHourlyCohorts, RUN_CHECK_SLOTS } from "./cohort-discovery";

const now = new Date("2026-10-27T12:00:00.000Z");
const registry = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    challenge: `JS-${String(i + 1).padStart(3, "0")}`,
    revision: syntheticRevision,
    window: syntheticWindow,
  }));
const found = (revs: ReturnType<typeof registry>, browsers: (i: number) => number = () => 20) =>
  revs.map(({ challenge, revision }, i) => ({ challenge, revision, browsers: browsers(i) }));
const key = (r: { challenge: string; revision: string }) => `${r.challenge}/${r.revision}`;

test("a run plans at most its CONTROL slots, one slot per 100 potential browsers", () => {
  const revs = registry(69);
  const plan = planHourlyCohorts(found(revs), revs, now, new Map());
  assert.equal(RUN_CHECK_SLOTS, 14);
  assert.equal(plan.builds.length, 14);
  assert.equal(plan.slots, 14);
  assert.equal(plan.deferred, 55);
  assert.equal(plan.oversized, 0);
  // Larger cohorts take more slots, so fewer revisions fit; the total never grows.
  const big = planHourlyCohorts(found(revs, (i) => (i < 3 ? 450 : 20)), revs, now, new Map());
  // Two 450-browser cohorts take 10 slots; the third doesn't fit and waits; four small ones fill the rest.
  assert.deepEqual(big.builds.map((b) => b.slots), [5, 5, 1, 1, 1, 1]);
  assert.equal(big.slots, RUN_CHECK_SLOTS);
  assert.equal(big.deferred, 69 - 6);
});

test("over 500 potential browsers is oversized: never built, always counted", () => {
  const revs = registry(5);
  const plan = planHourlyCohorts(found(revs, (i) => (i === 0 ? 501 : 500)), revs, now, new Map());
  assert.equal(plan.oversized, 1);
  assert.ok(plan.builds.every((b) => b.browsers <= 500));
  // 500 browsers is 5 slots: two fit in 14, the other two wait.
  assert.deepEqual([plan.builds.length, plan.slots, plan.deferred], [2, 10, 2]);
});

test("stalest first; a big cohort that doesn't fit lets smaller ones go, then leads the next run", () => {
  const revs = registry(10);
  const at = new Map(revs.map((r, i) => [key(r), 1000 + i]));
  // JS-001 (stalest) needs 5 slots, the others 1; budget 6 after JS-001 leaves room for 1 more.
  const plan = planHourlyCohorts(found(revs, (i) => (i === 1 ? 450 : i === 0 ? 450 : 20)), revs, now, at, 6);
  assert.deepEqual(plan.builds.map((b) => b.challenge), ["JS-001", "JS-003"]);
  assert.equal(plan.deferred, 8);
  // Next run: JS-001 and JS-003 are fresh now, so JS-002 (big, stalest) goes first.
  at.set("JS-001/" + syntheticRevision, 5000);
  at.set("JS-003/" + syntheticRevision, 5001);
  const next = planHourlyCohorts(found(revs, (i) => (i === 1 ? 450 : i === 0 ? 450 : 20)), revs, now, at, 6);
  assert.equal(next.builds[0].challenge, "JS-002");
});

test("fair eventual coverage of 141 revisions at 14 slots a run, even when deadlines cut runs short", () => {
  const revs = registry(141);
  const at = new Map<string, number>();
  const lastRun = new Map<string, number>();
  for (let run = 0; run < 24; run++) {
    const plan = planHourlyCohorts(found(revs), revs, new Date(+now + run * 3_600_000), at);
    // A deadline lets only the first 10 of 14 finish each run.
    plan.builds.slice(0, 10).forEach((b, i) => {
      at.set(key(b), run * 100 + i);
      lastRun.set(key(b), run);
    });
  }
  assert.equal(lastRun.size, 141, "every revision built within 24 short runs");
  // 141 revisions at 10 builds a run: each is rebuilt at least every 15 runs.
  for (const r of revs) assert.ok(23 - lastRun.get(key(r))! < 15, r.challenge);
});

test("without a listing, rotation still reaches every candidate", () => {
  const revs = registry(141);
  const seen = new Set<string>();
  for (let hour = 0; hour < 11; hour++)
    planHourlyCohorts(found(revs), revs, new Date(+now + hour * 3_600_000)).builds.forEach((b) => seen.add(b.challenge));
  assert.equal(seen.size, 141);
});

test("discovery refuses unknown revisions, duplicates, bad counts, overflow and unsafe registries", () => {
  const revs = registry(69);
  const rows = found(revs);
  for (const bad of [
    null,
    [...rows, rows[0]],
    [{ ...rows[0], revision: `sha256:${"0".repeat(64)}` }],
    [{ challenge: "JS-999", revision: syntheticRevision, browsers: 20 }],
    [{ ...rows[0], browsers: 19 }],
    [{ ...rows[0], browsers: "many" }],
    [{ ...rows[0], browsers: 2.5 }],
  ])
    assert.throws(() => planHourlyCohorts(bad, revs, now));
  assert.throws(() => planHourlyCohorts(rows, revs, new Date(NaN)));
  for (const bad of [
    [],
    [...revs, revs[0]],
    [{ ...revs[0], challenge: "' OR TRUE" }],
    [{ ...revs[0], window: { ...syntheticWindow, from: "2025-01-01T00:00:00.000Z" } }],
    [revs[0], { ...revs[1], window: { ...syntheticWindow, to: "2026-11-02T00:00:00.000Z" } }],
  ])
    assert.throws(() => cohortDiscoveryQuery(bad));
  // The registry bound is the size of the one discovery query, not the query count.
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(141)));
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(200)));
  assert.throws(() => cohortDiscoveryQuery(registry(201)));
  assert.match(cohortDiscoveryQuery(registry(3)), /COUNT\(DISTINCT e\.participant_id\) AS browsers/);
});
