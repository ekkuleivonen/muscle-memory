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
    name: "an ineligible conflicting copy still excludes its attempt",
    events: (() => {
      const a = attempt("c", 60);
      const p = JSON.parse(a[3].payload!);
      p.termsVersion = null;
      return [...a, { ...a[3], payload: JSON.stringify(p) }, ...attempt("ok", 90)];
    })(),
    attempts: 1,
  },
  {
    name: "arbitrary origin is counted but never echoed",
    events: attempt("odd", 60, { from: "<script>x</script>" }),
    attempts: 1,
  },
  {
    name: "non-canonical times are never trusted",
    events: (["2026-11-02T16:00:00.000+02:00", "2026-11-02T14:40:00Z", "2026-11-02 14:40:00.000Z"] as const).flatMap((form, i) => {
      const a = attempt(`t${i}`, 60);
      a[i === 2 ? 5 : 0] = { ...a[i === 2 ? 5 : 0], occurred_at: form };
      return a;
    }),
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
