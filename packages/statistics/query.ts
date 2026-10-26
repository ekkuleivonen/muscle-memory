/** Read-only interpretation of existing practice capture, not a capture/schema change. */
export interface StatsWindow {
  from: string;
  to: string;
  challenge: string;
  revision: string;
}
const DAY = 86400000;
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new Error("Use valid UTC dates (YYYY-MM-DD).");
  return value;
}
export function statsWindow(
  input: Record<string, string | string[] | undefined>,
  now = new Date(),
): StatsWindow {
  const to = date(input.to ?? now.toISOString().slice(0, 10));
  const from = date(
    input.from ?? new Date(Date.parse(to) - 6 * DAY).toISOString().slice(0, 10),
  );
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (days < 1 || days > 31)
    throw new Error("Choose between 1 and 31 UTC days.");
  const challenge = input.challenge ?? "",
    revision = input.revision ?? "";
  if (
    typeof challenge !== "string" ||
    (challenge && !/^[A-Z][A-Z0-9]{0,4}-\d{3}$/.test(challenge))
  )
    throw new Error("Use a challenge ID such as PY-003, or leave it empty.");
  if (
    typeof revision !== "string" ||
    (revision && !/^sha256:[0-9a-f]{64}$/.test(revision))
  )
    throw new Error("Use an exact sha256 revision, or leave it empty.");
  return { from, to, challenge, revision };
}

/** One SELECT over the catalog's current Iceberg snapshot. Never glob old Parquet files.
 * Only validated dates/IDs enter SQL. The only result rows are bounded aggregates.
 * Keep this deliberately fixed: no operator-supplied SQL, paths, table names or projections.
 */
export function statsQuery(
  window: StatsWindow,
  exclusions: { challenge: string; revision: string }[] = [],
): string {
  const w = statsWindow({ ...window });
  if (exclusions.length > 1000)
    throw new Error("Too many synthetic revisions for this view.");
  const excluded =
    exclusions
      .map((e) => {
        const checked = statsWindow({ ...window, ...e });
        if (!checked.challenge || !checked.revision)
          throw new Error("Exclusions need exact revisions.");
        return `(challenge = '${checked.challenge}' AND challenge_revision = '${checked.revision}')`;
      })
      .join(" OR ") || "FALSE";
  const end = new Date(Date.parse(w.to) + DAY).toISOString().slice(0, 10);
  return `WITH record_groups AS (
  SELECT record_id, MAX(type) AS type, MAX(capture_version) AS capture_version,
    MAX(participant_id) AS participant_id, MAX(attempt_id) AS attempt_id,
    MAX(challenge) AS challenge, MAX(challenge_revision) AS challenge_revision,
    MAX(occurred_at) AS occurred_at, MAX(received_at) AS received_at,
    MAX(payload) AS payload, COUNT(*) AS copies, COUNT(DISTINCT payload) AS variants
  FROM default.events
  WHERE kind = 'observation'
    AND occurred_at >= '${w.from}T00:00:00.000Z' AND occurred_at < '${end}T00:00:00.000Z'
  GROUP BY record_id
), observations AS (
  SELECT * FROM record_groups WHERE variants = 1
), eligible AS (
  SELECT * FROM observations WHERE NOT (${excluded})
), practice AS (
  SELECT *, json_get_str(json_get_json(payload, 'data'), 'runId') AS run_id,
    json_get_str(json_get_json(payload, 'data'), 'status') AS run_status
  FROM eligible
  WHERE capture_version IN ('practice-capture-1.0.0', 'practice-capture-1.1.0')
    AND type IN ('practice.started', 'practice.opened', 'practice.run', 'practice.submitted', 'practice.completed')
    AND participant_id IS NOT NULL AND participant_id <> ''
    AND attempt_id IS NOT NULL AND attempt_id <> ''
    AND regexp_like(challenge, '^[A-Z][A-Z0-9]{0,4}-[0-9]{3}$')
    AND regexp_like(challenge_revision, '^sha256:[0-9a-f]{64}$')
    ${w.challenge ? `AND challenge = '${w.challenge}'` : ""}
    ${w.revision ? `AND challenge_revision = '${w.revision}'` : ""}
), attempts AS (
  SELECT challenge, challenge_revision, participant_id, attempt_id,
    MIN(CASE WHEN type = 'practice.started' THEN occurred_at END) AS started,
    MAX(CASE WHEN type = 'practice.completed' THEN occurred_at END) AS completed,
    COUNT(DISTINCT CASE WHEN type = 'practice.submitted' THEN run_id END) AS submissions,
    COUNT(DISTINCT CASE WHEN type = 'practice.run' AND run_status = 'queued' THEN run_id END) AS runs
  FROM practice GROUP BY challenge, challenge_revision, participant_id, attempt_id
)
SELECT 'coverage' AS scope, NULL AS challenge, NULL AS challenge_revision,
  (SELECT COUNT(*) FROM observations) AS observed,
  (SELECT COALESCE(SUM(copies - 1), 0) FROM record_groups WHERE variants = 1) AS duplicates,
  (SELECT COUNT(*) FROM record_groups WHERE variants <> 1) AS conflicts,
  (SELECT COUNT(*) FROM observations WHERE ${excluded}) AS known_synthetic,
  (SELECT COUNT(*) FROM observations WHERE type LIKE 'practice.%' AND (capture_version IS NULL OR capture_version NOT IN
    ('practice-capture-1.0.0', 'practice-capture-1.1.0'))) AS unsupported,
  (SELECT MIN(occurred_at) FROM observations) AS first_observed,
  (SELECT MAX(occurred_at) FROM observations) AS last_observed,
  (SELECT MAX(received_at) FROM observations) AS last_received,
  NULL AS starts, NULL AS browser_ids, NULL AS completions, NULL AS submissions,
  NULL AS runs, NULL AS missing_starts
UNION ALL
SELECT 'challenge' AS scope, challenge, challenge_revision,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  SUM(CASE WHEN started IS NOT NULL THEN 1 ELSE 0 END) AS starts,
  COUNT(DISTINCT CASE WHEN started IS NOT NULL THEN participant_id END) AS browser_ids,
  SUM(CASE WHEN started IS NOT NULL AND completed >= started THEN 1 ELSE 0 END) AS completions,
  SUM(submissions) AS submissions, SUM(runs) AS runs,
  SUM(CASE WHEN started IS NULL THEN 1 ELSE 0 END) AS missing_starts
FROM attempts GROUP BY challenge, challenge_revision
LIMIT 502`;
}
