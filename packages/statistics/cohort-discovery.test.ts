import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticRevision } from "../developer-profile/fixtures";
import { syntheticWindow } from "./cohort-fixtures";
import { cohortDiscoveryQuery, selectHourlyCohorts, MAX_HOURLY_COHORT_BUILDS } from "./cohort-discovery";

const current = Array.from({ length: 69 }, (_, i) => ({
  challenge: `JS-${String(i + 1).padStart(3, "0")}`,
  revision: syntheticRevision,
  window: syntheticWindow,
}));
const rows = current.map(({ challenge, revision }) => ({
  challenge,
  revision,
}));
const now = new Date("2026-10-27T12:00:00.000Z");
test("hourly selection bounds exact scans and covers a stable candidate set without a stored cursor", () => {
  const seen = new Set<string>();
  for (let hour = 0; hour < 6; hour++) {
    const selected = selectHourlyCohorts(
      rows,
      current,
      new Date(+now + hour * 3_600_000),
    );
    assert.equal(selected.length, Math.min(current.length, MAX_HOURLY_COHORT_BUILDS));
    assert.equal(new Set(selected.map((r) => r.challenge)).size, selected.length);
    selected.forEach((r) => seen.add(r.challenge));
  }
  assert.equal(seen.size, 69);
  assert.deepEqual(
    selectHourlyCohorts(rows.slice(0, 3), current, now),
    current.slice(0, 3),
  );
  assert.deepEqual(selectHourlyCohorts([], current, now), []);
  assert.deepEqual(
    selectHourlyCohorts([...rows].reverse(), current, now),
    selectHourlyCohorts(rows, current, now),
  );
});
test("discovery refuses unknown revisions, duplicates, overflow and unsafe registry boundaries", () => {
  for (const bad of [
    null,
    [...rows, rows[0]],
    [rows[0], rows[0]],
    [{ ...rows[0], revision: `sha256:${"0".repeat(64)}` }],
    [{ challenge: "JS-999", revision: syntheticRevision }],
  ])
    assert.throws(() => selectHourlyCohorts(bad, current, now));
  for (const bad of [
    [],
    [...current, current[0]],
    [{ ...current[0], challenge: "' OR TRUE" }],
    [
      {
        ...current[0],
        window: { ...syntheticWindow, from: "2025-01-01T00:00:00.000Z" },
      },
    ],
    [
      current[0],
      {
        ...current[1],
        window: { ...syntheticWindow, to: "2026-11-02T00:00:00.000Z" },
      },
    ],
  ])
    assert.throws(() => cohortDiscoveryQuery(bad));
  const registry = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...current[0],
      challenge: `JS-${String(i).padStart(3, "0")}`,
    }));
  // The registry bound is the size of the one discovery query, not the query count.
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(141)));
  assert.doesNotThrow(() => cohortDiscoveryQuery(registry(200)));
  assert.throws(() => cohortDiscoveryQuery(registry(201)));
  assert.throws(() => selectHourlyCohorts(rows, current, new Date(NaN)));
});

const launch = Array.from({ length: 141 }, (_, i) => ({
  challenge: `JS-${String(i + 1).padStart(3, "0")}`,
  revision: syntheticRevision,
  window: syntheticWindow,
}));
const launchRows = launch.map(({ challenge, revision }) => ({ challenge, revision }));
const key = (r: { challenge: string; revision: string }) => `${r.challenge}/${r.revision}`;

test("141 candidates: the stalest 99 first, never-built before old, then by challenge", () => {
  const at = new Map<string, number>();
  launch.slice(0, 100).forEach((r, i) => at.set(key(r), 1000 + i)); // JS-001 oldest … JS-100
  const picked = selectHourlyCohorts(launchRows, launch, now, at);
  assert.equal(picked.length, MAX_HOURLY_COHORT_BUILDS);
  // The 41 never built (JS-101…JS-141) come first, then the 58 oldest.
  assert.deepEqual(picked.slice(0, 41).map((r) => r.challenge), launch.slice(100).map((r) => r.challenge));
  assert.deepEqual(picked.slice(41).map((r) => r.challenge), launch.slice(0, 58).map((r) => r.challenge));
});

test("fair later coverage: with a deadline cutting runs short, every candidate is reached and none starves", () => {
  const at = new Map<string, number>();
  const lastRun = new Map<string, number>();
  for (let hour = 0; hour < 6; hour++) {
    const picked = selectHourlyCohorts(launchRows, launch, new Date(+now + hour * 3_600_000), at);
    // A deadline lets only the first 60 of 99 finish each run.
    picked.slice(0, 60).forEach((r, i) => {
      at.set(key(r), hour * 1000 + i);
      lastRun.set(key(r), hour);
    });
  }
  assert.equal(lastRun.size, 141, "every revision built within six short runs");
  // 141 revisions at 60 builds a run: each is rebuilt at least every third run.
  for (const r of launch) assert.ok(5 - lastRun.get(key(r))! <= 2, r.challenge);
});
