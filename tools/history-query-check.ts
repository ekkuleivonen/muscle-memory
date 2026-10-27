/** Synthetic-only planner regression: SQLite alone cannot validate DataFusion execution. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { trace } from "../packages/developer-profile/fixtures";
import { historyQuery } from "../packages/developer-profile/uploaded-history";

const base = trace();
const other = trace("other-attempt", "other-source");
other[2] = {
  ...other[2],
  recordId: base[2].recordId,
  payload: other[2].payload.replace(
    JSON.parse(other[2].payload).observationId,
    base[2].recordId,
  ),
};
const foreign = trace("foreign-attempt", "foreign-source").map((r) => ({
  ...r,
  participantId: "foreign-participant",
  payload: r.payload.replaceAll("synthetic-participant", "foreign-participant"),
}));
const scenarios = [
  [],
  base,
  [...base, ...base],
  [...base, ...other, ...foreign],
  Array.from({ length: 105 }, (_, i) =>
    trace(`attempt-${i}`, `source-${i}`),
  ).flat(),
];
const window = { from: "2026-10-27", to: "2026-10-27", after: "" };
const cases: {
  query: string;
  events: Record<string, string | null>[];
  expected?: { attempts: number; continuation: number };
}[] = scenarios.map((records) => ({
  query: historyQuery("synthetic-participant", window),
  events: records.map((r) => {
    const o = JSON.parse(r.payload);
    return {
      record_id: r.recordId,
      participant_id: r.participantId,
      kind: r.kind,
      payload: r.payload,
      type: o.type,
      attempt_id: o.attemptId,
      occurred_at: o.occurredAt,
    };
  }),
}));
cases.push({
  ...cases[4],
  query: historyQuery("synthetic-participant", {
    ...window,
    after: "attempt-4",
  }),
});

cases[4].expected = { attempts: 100, continuation: 1 };
// Planner-only opaque payloads exercise aggregate record/UTF-8 byte limits, not practice grading.
const budgetEvent = (attempt: string, record: number, payload: string) => ({
  record_id: `${attempt}-${record}`,
  participant_id: "synthetic-participant",
  kind: "observation",
  payload,
  type: "practice.keys",
  attempt_id: attempt,
  occurred_at: "2026-10-27T10:00:00.000Z",
});
cases.push({
  query: historyQuery("synthetic-participant", window),
  events: Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 9000 }, (_, j) => budgetEvent(`budget-${i}`, j, "{}")),
  ).flat(),
  expected: { attempts: 2, continuation: 1 },
});
cases.push({
  query: historyQuery("synthetic-participant", window),
  events: Array.from({ length: 3 }, (_, i) =>
    budgetEvent(`unicode-${i}`, 0, "€".repeat(1024 * 1024)),
  ),
  expected: { attempts: 2, continuation: 1 },
});

const result = spawnSync(
  process.env.HISTORY_SQL_PYTHON ?? "python3",
  ["tools/history-query-check.py"],
  {
    input: JSON.stringify(cases),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  },
);
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(result.stdout).passed, cases.length);
console.log(
  JSON.stringify({
    measurements: JSON.parse(result.stdout).measurements,
    enginePeakRssMiB:
      JSON.parse(result.stdout).peakRss /
      (process.platform === "darwin" ? 1024 * 1024 : 1024),
  }),
);
console.log(
  `DataFusion physical execution agrees with SQLite on ${cases.length} synthetic history scenarios.`,
);
