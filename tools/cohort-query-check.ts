/** Runs the fixed cohort query in DataFusion and SQLite on synthetic browsers. See the .py header. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { syntheticRevision } from "../packages/developer-profile/fixtures";
import { cohortMemberQuery } from "../packages/statistics/current-cohort";
import { cohortDiscoveryQuery } from "../packages/statistics/cohort-discovery";
import { cohortQuery } from "../packages/statistics/cohort";
import {
  syntheticWindow,
  ADULT,
  browser,
  many,
  profile,
  type Event,
} from "../packages/statistics/cohort-fixtures";

const at = "2026-10-01T00:00:00.000Z";
const scenarios: { name: string; events: Event[]; browsers: number }[] = [
  { name: "empty", events: [], browsers: 0 },
  { name: "eligible adults", events: many(22), browsers: 22 },
  {
    name: "duplicate deliveries",
    events: [...many(21), ...many(21)],
    browsers: 21,
  },
  {
    name: "stealth now, minors, no age, models",
    events: [
      ...many(20),
      ...[0, 1, 2].flatMap((i) =>
        profile(
          `b${i}`,
          { ...ADULT, stealth: true },
          "2026-10-26T00:00:00.000Z",
        ),
      ),
      ...[0, 1].flatMap((i) => [
        ...browser(`k${i}`),
        profile(`k${i}`, { age: "16-17", stealth: false }, at),
      ]),
      ...[0, 1].flatMap((i) => [
        ...browser(`u${i}`),
        profile(`u${i}`, { stealth: false }, at),
      ]),
      ...[0, 1].flatMap((i) => [
        ...browser(`m${i}`, "a", { actor: "model" }),
        profile(`m${i}`, ADULT, at),
      ]),
    ],
    browsers: 17,
  },
  {
    name: "conflicting newer profile fails closed",
    events: (() => {
      const newer = profile(
        "b0",
        { ...ADULT, stealth: true },
        "2026-10-26T00:00:00.000Z",
      );
      return [
        ...many(21),
        newer,
        {
          ...newer,
          payload: newer.payload!.replace('"stealth":true', '"stealth":false'),
        },
      ];
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
const discoveryQuery = cohortDiscoveryQuery([
  { challenge: "JS-001", revision: syntheticRevision, window: syntheticWindow },
]);
const discoveryCases = [
  {
    name: "discovery deduplicates starts and skips 19",
    events: [...many(19), ...many(19)],
    expectedRows: [],
  },
  {
    name: "discovery finds 20 potential browsers",
    events: many(20),
    expectedRows: [{ challenge: "JS-001", revision: syntheticRevision }],
  },
  {
    name: "discovery excludes other revision and either date outside window",
    events: many(20).map((e) =>
      e.participant_id === "b0"
        ? { ...e, received_at: "2026-09-30T00:00:00.000Z" }
        : e.participant_id === "b1"
          ? { ...e, occurred_at: "2026-09-30T00:00:00.000Z" }
          : e.participant_id === "b2"
            ? { ...e, challenge_revision: `sha256:${"0".repeat(64)}` }
            : e,
    ),
    expectedRows: [],
  },
].map((s) => ({ ...s, query: discoveryQuery }));
discoveryCases.push({
  name: "batched discovery preserves each revision publication boundary",
  events: [
    ...many(20),
    ...many(20).map((e) => ({
      ...e,
      challenge: "JS-002",
      received_at: "2026-10-05T00:00:00.000Z",
    })),
    ...many(20).map((e) => ({
      ...e,
      challenge: "JS-003",
      occurred_at: "2026-10-16T00:00:00.000Z",
      received_at: "2026-10-16T00:00:00.000Z",
    })),
  ],
  expectedRows: ["JS-001", "JS-003"].map((challenge) => ({
    challenge,
    revision: syntheticRevision,
  })),
  query: cohortDiscoveryQuery([
    {
      challenge: "JS-001",
      revision: syntheticRevision,
      window: syntheticWindow,
    },
    ...["JS-002", "JS-003"].map((challenge) => ({
      challenge,
      revision: syntheticRevision,
      window: {
        ...syntheticWindow,
        from: "2026-10-10T00:00:00.000Z",
        publication: "2026-10-10T00:00:00.000Z",
      },
    })),
  ]),
});
const run = spawnSync(
  process.env.COHORT_SQL_PYTHON ?? "python3",
  ["tools/cohort-query-check.py"],
  {
    input: JSON.stringify([
      ...scenarios.flatMap((s) => [
        {
          ...s,
          query: cohortQuery("JS-001", syntheticRevision, syntheticWindow),
        },
        {
          ...s,
          name: `${s.name} (internal members)`,
          query: cohortMemberQuery(
            "JS-001",
            syntheticRevision,
            syntheticWindow,
          ),
        },
      ]),
      ...discoveryCases,
    ]),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  },
);
assert.equal(run.status, 0, run.stderr);
console.log(run.stdout.trim());
