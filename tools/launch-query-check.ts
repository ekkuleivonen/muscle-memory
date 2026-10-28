/** Runs the generated launch query in DataFusion and SQLite on synthetic attempts. See the .py header. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { launchQuery } from "../packages/statistics/launch";
import { announcedAt, asOf, at, attempt, fields, now, qaRevision, receipt, record, type Row } from "../packages/statistics/launch-fixtures";

const scenarios: { name: string; events: Row[]; attempts: number }[] = [
  { name: "empty", events: [], attempts: 0 },
  { name: "exact boundary and after", events: [...attempt("exact", 0), ...attempt("after", 60, { from: "link" })], attempts: 2 },
  {
    name: "prelaunch resumed after launch",
    events: [
      record("practice.started", "old", -60, { data: { from: "picker" } }),
      record("practice.completed", "old", 30),
      ...attempt("offline", -3, { received: 60 }),
      ...attempt("skewed", 5, { received: -1 }),
    ],
    attempts: 0,
  },
  {
    name: "missing, untrusted and conflicting starts",
    events: [
      record("practice.completed", "nostart", 10),
      ...attempt("noorigin", 20, { from: null }),
      ...(() => {
        const a = attempt("conflict", 50);
        return [...a, { ...a[0], payload: a[0].payload!.replace('"picker"', '"link"') }];
      })(),
      ...attempt("good", 60),
    ],
    attempts: 1,
  },
  {
    name: "synthetic QA, consent and duplicates",
    events: [
      ...attempt("qa", 10, { challenge: "PY-900", revision: qaRevision }),
      ...attempt("noterms", 20, { terms: null }),
      ...(() => {
        const a = attempt("dup", 30);
        return [...a, ...a];
      })(),
    ],
    attempts: 1,
  },
  {
    name: "a conflicting copy after the as-of leaves a prelaunch start excluded",
    events: (() => {
      const a = attempt("offline", -3, { received: 60 });
      const late = { ...a[0], occurred_at: at(10), received_at: at(1500), payload: a[0].payload!.replace(a[0].occurred_at!, at(10)) };
      return [...a, late, { ...late, record_id: a[1].record_id, attempt_id: "zzz", type: "site.viewed" }];
    })(),
    attempts: 0,
  },
  {
    name: "late arrivals",
    events: [...attempt("a", 60, { complete: false }), record("practice.completed", "a", 1380, { received: 1500 }), ...attempt("c", 1400, { received: 1450 })],
    attempts: 1,
  },
];
const query = launchQuery({ announcedAt, asOf, receipt, lookbackDays: 7 }, [{ challenge: "PY-900", revision: qaRevision }], now);
const run = spawnSync(process.env.LAUNCH_SQL_PYTHON ?? "python3", ["tools/launch-query-check.py"], {
  input: JSON.stringify(scenarios.map((s) => ({ ...s, fields, query }))),
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr);
console.log(run.stdout.trim());
