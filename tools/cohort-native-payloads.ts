/**
 * Prints the two bounded synthetic native Basin proofs for ENG-376 activation (the final member and
 * discovery queries), each with its expected rows. For an operator using an existing authorized SQL
 * route only; this script has no credentials and sends nothing.
 *
 * Each payload is the shipped query text with `default.events` replaced by an inline synthetic
 * table. The real table appears exactly once, as `SELECT … FROM default.events WHERE 1=0`, which
 * fixes the native column types and selects no rows, so no player data can be read. Expected rows
 * come from running the identical SQL here in SQLite with stand-ins for Basin's JSON functions;
 * the native run checks Basin's own JSON functions, planner and the 141-entry query length.
 *
 *   node --import tsx tools/cohort-native-payloads.ts
 */
import { spawnSync } from "node:child_process";
import { syntheticRevision } from "../packages/developer-profile/fixtures";
import {
  ADULT,
  browser,
  fields,
  many,
  profile,
  syntheticWindow,
  type Event,
} from "../packages/statistics/cohort-fixtures";
import { cohortMemberQuery } from "../packages/statistics/current-cohort";
import { cohortDiscoveryQuery } from "../packages/statistics/cohort-discovery";

const quote = (v: string | null) => (v === null ? "NULL" : `'${v.replaceAll("'", "''")}'`);
/** The shipped query over an inline synthetic table; the real table selects nothing. */
function synthetic(query: string, events: Event[]): string {
  const columns = fields.join(", ");
  const rows = events.map(
    (e) => `  SELECT ${fields.map((f) => `${quote(e[f])} AS ${f}`).join(", ")}`,
  );
  const table = `synthetic_events AS (\n  SELECT ${columns} FROM default.events WHERE 1=0\n  UNION ALL\n${rows.join("\n  UNION ALL\n")}\n)`;
  if (!query.startsWith("WITH ")) throw new Error("Expected a WITH query.");
  const sql = `WITH ${table},\n${query.slice(5).replaceAll("default.events", "synthetic_events")}`;
  // Proof obligation: the only reference to the real table is the empty, type-fixing select.
  const refs = sql.match(/default\.events/g) ?? [];
  if (refs.length !== 1 || !sql.includes("FROM default.events WHERE 1=0"))
    throw new Error("Payload must read no rows from default.events.");
  return sql;
}
/** Runs the payload in SQLite (the empty real-table select becomes an empty local table). */
function expected(sql: string): unknown[] {
  const script = `import sqlite3,json,sys
v=json.load(sys.stdin)
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.execute('CREATE TABLE events ('+', '.join(x+' TEXT' for x in v['fields'])+')')
def get(doc,key):
 try:
  d=json.loads(doc); return d.get(key) if isinstance(d,dict) else None
 except: return None
c.create_function('json_get_json',2,lambda doc,key: None if get(doc,key) is None else json.dumps(get(doc,key),separators=(',',':')))
c.create_function('json_get_str',2,lambda doc,key: get(doc,key) if isinstance(get(doc,key),str) else None)
print(json.dumps([dict(r) for r in c.execute(v['sql'].replace('default.events','events'))]))`;
  const out = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ fields, sql }),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (out.status !== 0) throw new Error(out.stderr);
  return JSON.parse(out.stdout);
}

const at = "2026-10-02T00:00:00.000Z";
// Member proof, compact: two countable browsers (one uploading a stealth 16–17 profile, which must
// be ignored: CONTROL decides later) and three that the query itself must leave out.
const members = [
  ...many(1, "ok"),
  ...browser("contrary"),
  profile("contrary", { age: "16-17", stealth: true }, at),
  ...browser("model", "a", { actor: "model" }),
  profile("model", ADULT, at),
  ...browser("noterms", "a", { noTerms: true }),
  ...browser("noorigin", "a", { noOrigin: true }),
];
const member = synthetic(
  cohortMemberQuery("JS-001", syntheticRevision, syntheticWindow),
  members,
);
// Discovery proof at launch size: 141 registry entries; 20 starters on JS-007, 19 on JS-100.
const registry = Array.from({ length: 141 }, (_, i) => ({
  challenge: `JS-${String(i + 1).padStart(3, "0")}`,
  revision: syntheticRevision,
  window: syntheticWindow,
}));
const starts = (n: number, challenge: string, prefix: string) =>
  many(n, prefix)
    .filter((e) => e.type === "practice.started")
    .map((e) => ({ ...e, challenge }));
const discovery = synthetic(cohortDiscoveryQuery(registry), [
  ...starts(20, "JS-007", "d"),
  ...starts(19, "JS-100", "e"),
]);

for (const [title, sql] of [
  ["1. Final member query, compact synthetic fixture", member],
  ["2. Final discovery query, 141 registry entries", discovery],
] as const) {
  console.log(`-- ${title}`);
  console.log(`-- Query text: ${new TextEncoder().encode(sql).length} bytes. Reads no rows from default.events (WHERE 1=0).`);
  console.log(`-- Expected rows (SQLite with JSON stand-ins; numbers may print as text natively):`);
  for (const row of expected(sql)) console.log(`--   ${JSON.stringify(row)}`);
  console.log(`${sql};\n`);
}
