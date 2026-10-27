/**
 * Prints read-only Basin SQL probes that isolate which part of the fixed private-history query
 * Basin rejects (ENG-340). For an operator with authorized SQL workbench access only. Every probe
 * returns counts or sizes, never payloads; the participant ID is a placeholder to fill in there.
 *   node --import tsx tools/history-query-probes.ts
 */
import { historyQuery } from "../packages/developer-profile/uploaded-history";

const P = "PARTICIPANT_ID_HERE";
const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.parse(to) - 365 * 86400000).toISOString().slice(0, 10);
const full = historyQuery("participant-placeholder", { from, to, after: "" }).replaceAll("participant-placeholder", P);
const owner = `SELECT record_id, payload, attempt_id, occurred_at FROM default.events
 WHERE participant_id = '${P}' AND kind = 'observation' AND type LIKE 'practice.%' AND attempt_id IS NOT NULL`;
const probes: [string, string][] = [
  ["1. Owner volume: plain filtered scan, no gated operations",
    `WITH owner AS (${owner}), per AS (SELECT attempt_id, COUNT(*) AS n, SUM(octet_length(payload)) AS bytes FROM owner GROUP BY attempt_id)
SELECT COUNT(*) AS attempts, SUM(n) AS observations, SUM(bytes) AS payload_bytes, MAX(n) AS largest_attempt_rows, MAX(bytes) AS largest_attempt_bytes FROM per`],
  ["2. Conflict check as shipped: COUNT(DISTINCT payload), a budget-gated aggregate",
    `WITH owner AS (${owner}) SELECT COUNT(*) AS conflicting_records FROM (SELECT record_id FROM owner GROUP BY record_id HAVING COUNT(DISTINCT payload) > 1) c`],
  ["3. Same conflict check without DISTINCT (MIN <> MAX is equivalent for non-null payloads)",
    `WITH owner AS (${owner}) SELECT COUNT(*) AS conflicting_records FROM (SELECT record_id FROM owner GROUP BY record_id HAVING MIN(payload) <> MAX(payload)) c`],
  ["4. Window functions only, over per-attempt aggregates (no payload returned)",
    `WITH owner AS (${owner}), per AS (SELECT attempt_id, COUNT(*) AS n FROM owner GROUP BY attempt_id ORDER BY attempt_id LIMIT 101)
SELECT MAX(position) AS rows_ranked FROM (SELECT ROW_NUMBER() OVER (ORDER BY attempt_id) AS position, SUM(n) OVER (ORDER BY attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running FROM per) w`],
  ["5. The full shipped query wrapped to return only a row count (run EXPLAIN on it too)",
    `SELECT COUNT(*) AS rows FROM (${full}) q`],
];
for (const [title, sql] of probes) console.log(`-- ${title}\n${sql};\n`);
