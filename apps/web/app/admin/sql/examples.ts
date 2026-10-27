/**
 * Starting points over the real tables (docs/telemetry.md, docs/model-runs.md). They select
 * counts, types and times, never code or participant IDs. Records can arrive twice, so they
 * count distinct record_id. `since` is a UTC date a week back, written in as a literal.
 */
export interface Example {
  title: string;
  sql: (since: string) => string;
}

export const EXAMPLES: Example[] = [
  {
    title: "Latest practice events",
    sql: () => `-- The 50 latest practice observations: what happened, on which challenge, when.
SELECT occurred_at, type, challenge, capture_version
FROM default.events
WHERE kind = 'observation'
  AND type LIKE 'practice.%'
ORDER BY occurred_at DESC
LIMIT 50`,
  },
  {
    title: "Events by type this week",
    sql: (since) => `-- Distinct records per type since ${since} (UTC).
SELECT type, COUNT(DISTINCT record_id) AS records
FROM default.events
WHERE kind = 'observation'
  AND occurred_at >= '${since}'
GROUP BY type
ORDER BY records DESC
LIMIT 100`,
  },
  {
    title: "Attempts, runs and completions per challenge",
    sql: (since) => `-- Per challenge since ${since}: attempts started and completed, test runs queued,
-- submissions. Completions are what the browser reported, not server grading.
WITH practice AS (
  SELECT DISTINCT ON (record_id)
    record_id,
    type,
    challenge,
    attempt_id,
    json_get_str(json_get_json(payload, 'data'), 'status') AS run_status
  FROM default.events
  WHERE kind = 'observation'
    AND occurred_at >= '${since}'
    AND type IN ('practice.started', 'practice.run', 'practice.submitted', 'practice.completed')
)
SELECT
  challenge,
  COUNT(DISTINCT CASE WHEN type = 'practice.started' THEN attempt_id END) AS started,
  COUNT(DISTINCT CASE WHEN type = 'practice.completed' THEN attempt_id END) AS completed,
  SUM(CASE WHEN type = 'practice.run' AND run_status = 'queued' THEN 1 ELSE 0 END) AS runs,
  SUM(CASE WHEN type = 'practice.submitted' THEN 1 ELSE 0 END) AS submissions
FROM practice
GROUP BY challenge
ORDER BY started DESC
LIMIT 200`,
  },
  {
    title: "Starts and completions by day",
    sql: (since) => `-- Practice starts and completions per UTC day since ${since}.
SELECT
  substr(occurred_at, 1, 10) AS day,
  COUNT(DISTINCT CASE WHEN type = 'practice.started' THEN record_id END) AS starts,
  COUNT(DISTINCT CASE WHEN type = 'practice.completed' THEN record_id END) AS completions
FROM default.events
WHERE kind = 'observation'
  AND occurred_at >= '${since}'
  AND type IN ('practice.started', 'practice.completed')
GROUP BY substr(occurred_at, 1, 10)
ORDER BY day DESC
LIMIT 100`,
  },
  {
    title: "Model runs by model and outcome",
    sql: () => `-- Stored benchmark runs (default.model_events): runs, challenges covered and outcomes
-- per model. A run's records share its session_id.
WITH started AS (
  SELECT
    session_id,
    MAX(challenge) AS challenge,
    MAX(json_get_str(json_get_json(payload, 'data'), 'model')) AS model
  FROM default.model_events
  WHERE type = 'model.run-started'
  GROUP BY session_id
),
ended AS (
  SELECT
    session_id,
    MAX(json_get_str(json_get_json(payload, 'data'), 'outcome')) AS outcome
  FROM default.model_events
  WHERE type = 'model.ended'
  GROUP BY session_id
)
SELECT
  s.model,
  COUNT(*) AS runs,
  COUNT(DISTINCT s.challenge) AS challenges,
  SUM(CASE WHEN e.outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN e.outcome IS NULL THEN 1 ELSE 0 END) AS no_end_recorded
FROM started s
LEFT JOIN ended e ON e.session_id = s.session_id
GROUP BY s.model
ORDER BY runs DESC
LIMIT 100`,
  },
  {
    title: "A table's columns",
    sql: () => "DESCRIBE default.events",
  },
];

/**
 * What a column holds beyond its type, where the code that writes it says so. Shown only for
 * columns the live schema has.
 */
export const COLUMN_HINTS: Record<string, string> = {
  "events.payload":
    "JSON text: the record as the device stored it. An observation's own fields are under data, e.g. json_get_str(json_get_json(payload, 'data'), 'status'). Can hold code: select it with care.",
  "model_events.payload":
    "JSON text: the record as the harness stored it. Fields are under data, e.g. json_get_str(json_get_json(payload, 'data'), 'model') on model.run-started.",
  "events.occurred_at": "ISO 8601 UTC text from the device's clock; compare with text like '2026-10-20'.",
  "events.received_at": "ISO 8601 UTC text, when the ingest Worker accepted the batch.",
  "events.record_id": "Uploads can repeat a record: count DISTINCT record_id.",
  "model_events.record_id": "Count DISTINCT record_id, as in the events table.",
  "events.participant_id": "A browser's random ID, not a person. Private: keep it in the admin.",
};
