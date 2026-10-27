/** Runs the fixed cohort query in DataFusion and SQLite on synthetic browsers. See the .py header. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { syntheticRevision } from "../packages/developer-profile/fixtures";
import { cohortMemberQuery } from "../packages/statistics/current-cohort";
import { cohortQuery } from "../packages/statistics/cohort";
import { ADULT, browser, many, profile, type Event } from "../packages/statistics/cohort-fixtures";

const at = "2026-10-01T00:00:00.000Z";
const scenarios: { name: string; events: Event[]; browsers: number }[] = [
  { name: "empty", events: [], browsers: 0 },
  { name: "eligible adults", events: many(22), browsers: 22 },
  { name: "duplicate deliveries", events: [...many(21), ...many(21)], browsers: 21 },
  {
    name: "stealth now, minors, no age, models",
    events: [
      ...many(20),
      ...[0, 1, 2].flatMap((i) => profile(`b${i}`, { ...ADULT, stealth: true }, "2026-10-26T00:00:00.000Z")),
      ...[0, 1].flatMap((i) => [...browser(`k${i}`), profile(`k${i}`, { age: "16-17", stealth: false }, at)]),
      ...[0, 1].flatMap((i) => [...browser(`u${i}`), profile(`u${i}`, { stealth: false }, at)]),
      ...[0, 1].flatMap((i) => [...browser(`m${i}`, "a", { actor: "model" }), profile(`m${i}`, ADULT, at)]),
    ],
    browsers: 17,
  },
  {
    name: "conflicting newer profile fails closed",
    events: (() => {
      const newer = profile("b0", { ...ADULT, stealth: true }, "2026-10-26T00:00:00.000Z");
      return [...many(21), newer, { ...newer, payload: newer.payload!.replace('"stealth":true', '"stealth":false') }];
    })(),
    browsers: 20,
  },
  {
    name: "first and repeat",
    events: Array.from({ length: 21 }, (_, i) => [
      profile(`r${i}`, ADULT, at),
      ...browser(`r${i}`, "a"),
      ...browser(`r${i}`, "b", { again: true, at: 86400000 }),
      ...browser(`r${i}`, "c", { again: true, at: 2 * 86400000 }),
    ]).flat(),
    browsers: 42,
  },
];
const run = spawnSync(process.env.COHORT_SQL_PYTHON ?? "python3", ["tools/cohort-query-check.py"], {
  input: JSON.stringify(scenarios.flatMap((s) => [
    { ...s, query: cohortQuery("JS-001", syntheticRevision) },
    { ...s, name: `${s.name} (internal members)`, query: cohortMemberQuery("JS-001", syntheticRevision) },
  ])),
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr);
console.log(run.stdout.trim());
