/**
 * Prints read-only Basin SQL probes that isolate which part of the fixed private-history query
 * fails natively (ENG-340). For an operator with authorized SQL workbench access only. Every probe
 * returns counts or sizes, never payloads; the participant ID is a placeholder to fill in there.
 * Limits: an aggregating wrapper is not byte-for-byte the shipped read (result transfer differs, and
 * an engine may still prune differently), so a passing probe 5 doesn't clear the real request.
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
  ["4. The shipped window functions only (ROW_NUMBER, two running SUMs, LAG), each consumed so none is pruned; no payload returned",
    `WITH owner AS (${owner}), per AS (SELECT attempt_id, COUNT(*) AS n, SUM(octet_length(payload)) AS bytes FROM owner GROUP BY attempt_id ORDER BY attempt_id LIMIT 101),
ranked AS (SELECT attempt_id, ROW_NUMBER() OVER (ORDER BY attempt_id) AS position,
 SUM(bytes) OVER (ORDER BY attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_bytes,
 SUM(n) OVER (ORDER BY attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_records FROM per),
lagged AS (SELECT *, LAG(position, 1, 0) OVER (ORDER BY position) AS previous FROM ranked)
SELECT MAX(position) AS rows_ranked, MAX(running_bytes) AS bytes_total, MAX(running_records) AS records_total, SUM(previous) AS lag_check FROM lagged`],
  ["5. The full shipped query, aggregated so payload must still be read (row count, payload bytes, scopes); compare EXPLAIN with the bare query",
    `SELECT COUNT(*) AS rows, SUM(octet_length(payload)) AS payload_bytes, COUNT(record_id) AS observation_rows, MAX(scope) AS last_scope FROM (${full}) q`],
];
for (const [title, sql] of probes) console.log(`-- ${title}\n${sql};\n`);
