import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticRevision } from "../developer-profile/fixtures";
import { syntheticWindow } from "./cohort-fixtures";
import {
  cohortDiscoveryQuery,
  planHourlyCohorts,
  HUMAN_ROTATION,
  RUN_CHECK_SLOTS,
} from "./cohort-discovery";

const now = new Date("2026-10-27T12:00:00.000Z");
const hourAt = (h: number) => new Date(+now + h * 3_600_000);
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
  assert.deepEqual([plan.builds.length, plan.slots, plan.deferred, plan.oversized], [14, RUN_CHECK_SLOTS, 55, 0]);
  // Larger cohorts take more slots, so fewer revisions fit; the total never grows.
  const big = planHourlyCohorts(found(revs, (i) => (i % 2 ? 450 : 20)), revs, now, new Map());
  assert.ok(big.slots <= RUN_CHECK_SLOTS);
  assert.equal(big.builds.reduce((n, b) => n + b.slots, 0), big.slots);
  assert.ok(big.builds.some((b) => b.slots === 5));
  assert.equal(big.builds.length + big.deferred, 69);
});

test("over 500 potential browsers is oversized: never built, always counted", () => {
  const revs = registry(5);
  const plan = planHourlyCohorts(found(revs, (i) => (i === 0 ? 501 : 500)), revs, now, new Map());
  assert.equal(plan.oversized, 1);
  assert.ok(plan.builds.every((b) => b.browsers <= 500 && b.slots === 5));
  assert.deepEqual([plan.builds.length, plan.slots, plan.deferred], [2, 10, 2]);
});

test("rotation picks come first, then the stalest; a pick doesn't depend on past success", () => {
  const revs = registry(30);
  const at = new Map(revs.map((r, i) => [key(r), 1000 + i]));
  const a = planHourlyCohorts(found(revs), revs, now, at);
  const b = planHourlyCohorts(found(revs), revs, now, new Map());
  // The first HUMAN_ROTATION builds are the same whatever the history says.
  assert.deepEqual(
    a.builds.slice(0, HUMAN_ROTATION).map((x) => x.challenge),
    b.builds.slice(0, HUMAN_ROTATION).map((x) => x.challenge),
  );
  // After them, oldest first.
  const rest = a.builds.slice(HUMAN_ROTATION).map((x) => at.get(key(x))!);
  assert.deepEqual(rest, [...rest].sort((x, y) => x - y));
});

test("poison frontier: 99 never-buildable revisions can't starve the 42 healthy ones", () => {
  const revs = registry(141);
  const poison = new Set(revs.slice(0, 99).map(key)); // stalest forever: they never succeed
  const at = new Map<string, number>();
  const lastBuilt = new Map<string, number>();
  for (let run = 0; run < 72; run++) {
    const plan = planHourlyCohorts(found(revs), revs, hourAt(run), at);
    plan.builds.forEach((b, i) => {
      if (poison.has(key(b))) return;
      at.set(key(b), run * 100 + i);
      lastBuilt.set(key(b), run);
    });
  }
  const healthy = revs.filter((r) => !poison.has(key(r)));
  for (const r of healthy) assert.ok(lastBuilt.has(key(r)), `${r.challenge} reached`);
  // Every healthy revision is rebuilt at least once per rotation cycle, ceil(141 / 4) = 36 runs.
  for (const r of healthy) assert.ok(71 - lastBuilt.get(key(r))! < 36, r.challenge);
});

test("a deadline that lets only the rotation picks finish still covers everything", () => {
  const revs = registry(141);
  const at = new Map<string, number>();
  const seen = new Set<string>();
  for (let run = 0; run < 36; run++) {
    const plan = planHourlyCohorts(found(revs), revs, hourAt(run), at);
    plan.builds.slice(0, HUMAN_ROTATION).forEach((b, i) => {
      at.set(key(b), run * 100 + i);
      seen.add(key(b));
    });
  }
  assert.equal(seen.size, 141);
});

test("without a listing, the rotation still reaches every candidate", () => {
  const revs = registry(141);
  const seen = new Set<string>();
  // 10 builds after the 4 rotation picks: ceil(141 / 10) = 15 runs.
  for (let h = 0; h < 15; h++)
    planHourlyCohorts(found(revs), revs, hourAt(h)).builds.forEach((b) => seen.add(b.challenge));
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
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(141)));
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(200)));
  assert.throws(() => cohortDiscoveryQuery(registry(201)));
  assert.match(cohortDiscoveryQuery(registry(3)), /COUNT\(DISTINCT e\.participant_id\) AS browsers/);
});
