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
  assert.throws(() =>
    cohortDiscoveryQuery(
      Array.from({ length: 101 }, (_, i) => ({
        ...current[0],
        challenge: `JS-${String(i).padStart(3, "0")}`,
      })),
    ),
  );
  assert.throws(() => selectHourlyCohorts(rows, current, new Date(NaN)));
});
