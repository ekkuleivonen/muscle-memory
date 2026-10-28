import { test } from "node:test";
import assert from "node:assert/strict";
import { cohortWindow, checkCohortWindow } from "./cohort-window";
test("server dates cap at 90 days and retain publication provenance for first/repeat interpretation", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const short = cohortWindow("2026-10-01T00:00:00.000Z", now);
  assert.equal(short.from, short.publication);
  const long = cohortWindow("2026-01-01T00:00:00.000Z", now);
  assert.equal(Date.parse(long.to) - Date.parse(long.from), 90 * 86400000);
  assert.notEqual(long.from, long.publication);
  for (const publication of [
    "2026-02-30T00:00:00.000Z",
    "' OR TRUE",
    "2027-01-01T00:00:00.000Z",
  ])
    assert.throws(() => cohortWindow(publication, now));
  assert.throws(() =>
    checkCohortWindow({ ...short, from: "2026-01-01T00:00:00.000Z" }),
  );
});
