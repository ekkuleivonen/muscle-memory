/**
 * Launch-only attempt reporting (ENG-337), for the admin SQL workbench (docs/launch-reporting.md).
 *
 * Owner decision, 28 October 2026 04:06 UTC: keep existing data and report from the exact public
 * announcement time, counting only attempts that started at or after it. Nothing is deleted or
 * reset. The announcement time is a required parameter with no default: it comes only from the
 * approved public launch receipt, never from now, midnight, a commit, a deploy or an artifact.
 *
 * Eligibility (which attempts are in the cohort) is decided once, in `classified`; every
 * aggregate reads the same `included` attempts. Read-only interpretation of existing capture:
 * no new events, tables or stored results.
 */
import { CHALLENGE_KEY, REVISION } from "../domain/records";

export const LAUNCH_REPORT_VERSION = "launch-report-1";
/** Records arrive late (offline outboxes, Pipelines writes a file every 5 minutes): an as-of must be this old. */
export const SETTLE_MS = 60 * 60 * 1000;
export const MAX_REPORT_DAYS = 31;
export const DEFAULT_LOOKBACK_DAYS = 7;
const DAY = 86400000;
/** The ingest Worker and devices write `new Date().toISOString()`, so text order is time order. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** As in the admin statistics query: the practice captures this interpretation understands. */
const CAPTURES = ["practice-capture-1.0.0", "practice-capture-1.1.0", "practice-capture-1.2.0"];

export interface LaunchWindow {
  /** The public announcement, exactly as its receipt records it. Attempts start at or after it. */
  announcedAt: string;
  /** Where that time comes from: the approved public announcement's URL. */
  receipt: string;
  /** Only records that had arrived, and happened, before this instant are read. */
  asOf: string;
  /** How far before the announcement start records are read to recognise pre-launch attempts. */
  lookbackDays: number;
}

function instant(value: unknown, name: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(
      name === "announcedAt"
        ? "The announcement time is required. Take it from the approved public launch receipt; there is no default."
        : `${name} is required.`,
    );
  if (!INSTANT.test(value) || new Date(Date.parse(value)).toISOString() !== value)
    throw new Error(`${name} must be an exact UTC instant like 2026-11-02T14:30:00.000Z.`);
  return value;
}

export function launchWindow(input: Record<string, unknown>, now = new Date()): LaunchWindow {
  const announcedAt = instant(input.announcedAt, "announcedAt");
  const asOf = instant(input.asOf, "asOf");
  // It is written into a SQL comment: one line of plain URL text, exactly as given.
  const raw = typeof input.receipt === "string" ? input.receipt : "";
  let receipt: URL | null = null;
  try {
    receipt = new URL(raw);
  } catch {}
  if (!receipt || receipt.protocol !== "https:" || receipt.href !== raw || !/^[\x21-\x7e]{1,500}$/.test(raw))
    throw new Error("receipt must be the https URL of the approved public announcement.");
  const lookbackDays = input.lookbackDays === undefined ? DEFAULT_LOOKBACK_DAYS : Number(input.lookbackDays);
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > MAX_REPORT_DAYS)
    throw new Error(`lookbackDays must be a whole number from 1 to ${MAX_REPORT_DAYS}.`);
  const span = Date.parse(asOf) - Date.parse(announcedAt);
  if (span <= 0) throw new Error("asOf must be after the announcement.");
  if (span > MAX_REPORT_DAYS * DAY) throw new Error(`Report at most ${MAX_REPORT_DAYS} days after the announcement.`);
  if (Date.parse(asOf) > now.getTime() - SETTLE_MS)
    throw new Error("asOf must be at least an hour in the past, so records up to it have reached the table.");
  return { announcedAt, receipt: receipt.href, asOf, lookbackDays };
}

const COLUMNS = [
  "section", "origin", "challenge", "challenge_revision",
  // Included whole attempts: the launch cohort.
  "attempts", "browser_ids", "completed", "submitted_attempts", "submissions", "runs", "clock_ahead_starts",
  // Attempts with activity after the announcement that are not counted, by reason.
  "prelaunch_resumed", "missing_start", "conflicting_attempts", "untrusted_start",
  // Records from the announcement to the as-of.
  "observed_records", "duplicate_copies", "conflicting_records", "arrived_after_as_of", "synthetic_records",
  "ineligible_records", "latest_receipt",
] as const;
type Column = (typeof COLUMNS)[number];
/** One UNION branch: the named columns, NULL for the rest, always in the same order. */
const branch = (values: Partial<Record<Column, string>>, from: string) =>
  `SELECT ${COLUMNS.map((c) => `${values[c] ?? "NULL"} AS ${c}`).join(",\n  ")}\n${from}`;
const cohort = {
  attempts: "COUNT(*)",
  browser_ids: "COUNT(DISTINCT participant_id)",
  completed: "SUM(completed)",
  submitted_attempts: "SUM(CASE WHEN submissions > 0 THEN 1 ELSE 0 END)",
  submissions: "SUM(submissions)",
  runs: "SUM(runs)",
};

/**
 * One fixed SELECT over `default.events`, generated for the workbench. Only validated instants,
 * a count of days, the receipt URL (in a comment) and exact synthetic revisions enter the text.
 * Output is aggregates only: no participant, attempt, record, code or payload.
 */
export function launchQuery(input: LaunchWindow, exclusions: { challenge: string; revision: string }[], now = new Date()): string {
  const w = launchWindow({ ...input }, now);
  if (exclusions.length > 1000) throw new Error("Too many synthetic revisions for this query.");
  const excluded =
    exclusions
      .map((e) => {
        if (!CHALLENGE_KEY.test(e.challenge) || !REVISION.test(e.revision))
          throw new Error("Exclusions need exact revisions.");
        return `(challenge = '${e.challenge}' AND challenge_revision = '${e.revision}')`;
      })
      .join(" OR ") || "FALSE";
  const B = `'${w.announcedAt}'`,
    A = `'${w.asOf}'`;
  const scanFrom = new Date(Date.parse(w.announcedAt) - w.lookbackDays * DAY).toISOString();
  return `-- ${LAUNCH_REPORT_VERSION}: whole attempts started at or after the public announcement (ENG-337).
-- Announcement ${w.announcedAt}, from ${w.receipt}
-- As of ${w.asOf}; start records read from ${scanFrom}. Synthetic QA revisions excluded: ${exclusions.length}.
-- Generated by npm run launch:query. Internal aggregates only: see docs/launch-reporting.md before sharing any figure.
WITH record_groups AS (
  -- One row per record. Every field comes only from copies received before the as-of, so a copy
  -- arriving later (even a conflicting one) cannot change a frozen report. late_occurred_at is
  -- read only to count records that arrived after the as-of.
  SELECT record_id,
    MAX(CASE WHEN received_at < ${A} THEN type END) AS type,
    MAX(CASE WHEN received_at < ${A} THEN capture_version END) AS capture_version,
    MAX(CASE WHEN received_at < ${A} THEN participant_id END) AS participant_id,
    MAX(CASE WHEN received_at < ${A} THEN attempt_id END) AS attempt_id,
    MAX(CASE WHEN received_at < ${A} THEN challenge END) AS challenge,
    MAX(CASE WHEN received_at < ${A} THEN challenge_revision END) AS challenge_revision,
    MAX(CASE WHEN received_at < ${A} THEN occurred_at END) AS occurred_at,
    MAX(occurred_at) AS late_occurred_at,
    MIN(CASE WHEN received_at < ${A} THEN received_at END) AS received_at,
    MAX(CASE WHEN received_at < ${A} THEN payload END) AS payload,
    SUM(CASE WHEN received_at < ${A} THEN 1 ELSE 0 END) AS copies,
    COUNT(DISTINCT CASE WHEN received_at < ${A} THEN payload END) AS variants
  FROM default.events
  WHERE kind = 'observation'
    AND occurred_at >= '${scanFrom}' AND occurred_at < ${A}
  GROUP BY record_id
), checked AS (
  -- Eligibility of each record, kept apart from any aggregate.
  SELECT *,
    CASE WHEN ${excluded} THEN 1 ELSE 0 END AS synthetic,
    CASE WHEN type LIKE 'practice.%'
      AND capture_version IN (${CAPTURES.map((c) => `'${c}'`).join(", ")})
      AND json_get_str(payload, 'actor') = 'person'
      AND json_get_str(payload, 'termsVersion') IS NOT NULL AND json_get_str(payload, 'termsVersion') <> ''
      AND participant_id IS NOT NULL AND participant_id <> ''
      AND attempt_id IS NOT NULL AND attempt_id <> ''
      AND regexp_like(challenge, '^[A-Z][A-Z0-9]{0,4}-[0-9]{3}$')
      AND regexp_like(challenge_revision, '^sha256:[0-9a-f]{64}$')
    THEN 1 ELSE 0 END AS eligible
  FROM record_groups
), practice AS (
  SELECT *, json_get_json(payload, 'data') AS data,
    json_get_str(json_get_json(payload, 'data'), 'runId') AS run_id,
    json_get_str(json_get_json(payload, 'data'), 'status') AS run_status
  FROM checked WHERE copies > 0 AND eligible = 1 AND synthetic = 0
), attempts AS (
  SELECT participant_id, attempt_id, challenge, challenge_revision,
    MIN(CASE WHEN type = 'practice.started' THEN occurred_at END) AS started,
    MIN(CASE WHEN type = 'practice.started' THEN received_at END) AS start_received,
    SUM(CASE WHEN variants = 1 AND type = 'practice.started' THEN 1 ELSE 0 END) AS start_records,
    SUM(CASE WHEN variants = 1 AND type = 'practice.started' AND json_get_str(data, 'from') IS NULL THEN 1 ELSE 0 END) AS starts_without_origin,
    MAX(CASE WHEN variants = 1 AND type = 'practice.started' THEN json_get_str(data, 'from') END) AS origin,
    MAX(CASE WHEN type = 'practice.started' AND occurred_at > received_at THEN 1 ELSE 0 END) AS clock_ahead,
    SUM(CASE WHEN variants > 1 THEN 1 ELSE 0 END) AS conflicts,
    MAX(CASE WHEN occurred_at >= ${B} THEN 1 ELSE 0 END) AS active_after,
    MAX(CASE WHEN variants = 1 AND type = 'practice.completed' THEN 1 ELSE 0 END) AS completed,
    COUNT(DISTINCT CASE WHEN variants = 1 AND type = 'practice.submitted' THEN run_id END) AS submissions,
    COUNT(DISTINCT CASE WHEN variants = 1 AND type = 'practice.run' AND run_status = 'queued' THEN run_id END) AS runs
  FROM practice
  GROUP BY participant_id, attempt_id, challenge, challenge_revision
), classified AS (
  -- The cohort, decided once. A start before the announcement (by the device's clock or by when it
  -- reached us) excludes the whole attempt, however much of it happened later.
  SELECT *, CASE
    WHEN started IS NOT NULL AND (started < ${B} OR start_received < ${B}) THEN 'prelaunch'
    WHEN conflicts > 0 THEN 'conflicting'
    WHEN start_records = 0 THEN 'missing-start'
    WHEN start_records > 1 OR starts_without_origin > 0 THEN 'untrusted-start'
    ELSE 'included' END AS cohort
  FROM attempts WHERE active_after = 1
), included AS (
  SELECT * FROM classified WHERE cohort = 'included'
)
${branch(
  {
    section: "'coverage'",
    observed_records: "SUM(CASE WHEN copies > 0 AND variants = 1 THEN 1 ELSE 0 END)",
    duplicate_copies: "SUM(CASE WHEN variants = 1 THEN copies - 1 ELSE 0 END)",
    conflicting_records: "SUM(CASE WHEN variants > 1 THEN 1 ELSE 0 END)",
    arrived_after_as_of: "SUM(CASE WHEN copies = 0 THEN 1 ELSE 0 END)",
    synthetic_records: "SUM(CASE WHEN copies > 0 AND synthetic = 1 THEN 1 ELSE 0 END)",
    ineligible_records: "SUM(CASE WHEN copies > 0 AND synthetic = 0 AND eligible = 0 AND type LIKE 'practice.%' THEN 1 ELSE 0 END)",
    latest_receipt: "MAX(received_at)",
  },
  `FROM checked WHERE occurred_at >= ${B} OR (copies = 0 AND late_occurred_at >= ${B})`,
)}
UNION ALL
${branch(
  {
    section: "'launch'",
    attempts: "SUM(CASE WHEN cohort = 'included' THEN 1 ELSE 0 END)",
    browser_ids: "COUNT(DISTINCT CASE WHEN cohort = 'included' THEN participant_id END)",
    completed: "SUM(CASE WHEN cohort = 'included' THEN completed ELSE 0 END)",
    submitted_attempts: "SUM(CASE WHEN cohort = 'included' AND submissions > 0 THEN 1 ELSE 0 END)",
    submissions: "SUM(CASE WHEN cohort = 'included' THEN submissions ELSE 0 END)",
    runs: "SUM(CASE WHEN cohort = 'included' THEN runs ELSE 0 END)",
    clock_ahead_starts: "SUM(CASE WHEN cohort = 'included' THEN clock_ahead ELSE 0 END)",
    prelaunch_resumed: "SUM(CASE WHEN cohort = 'prelaunch' THEN 1 ELSE 0 END)",
    missing_start: "SUM(CASE WHEN cohort = 'missing-start' THEN 1 ELSE 0 END)",
    conflicting_attempts: "SUM(CASE WHEN cohort = 'conflicting' THEN 1 ELSE 0 END)",
    untrusted_start: "SUM(CASE WHEN cohort = 'untrusted-start' THEN 1 ELSE 0 END)",
  },
  "FROM classified",
)}
UNION ALL
${branch({ section: "'origin'", origin: "origin", ...cohort }, "FROM included GROUP BY origin")}
UNION ALL
${branch(
  { section: "'challenge'", challenge: "challenge", challenge_revision: "challenge_revision", ...cohort },
  "FROM included GROUP BY challenge, challenge_revision",
)}
LIMIT 502`;
}
