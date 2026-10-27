-- Model runs (docs/model-runs.md). Applying this to production requires explicit approval.
-- The models to run every published revision with. Adding one backfills it; retiring one
-- stops new runs and keeps the old.
CREATE TABLE model_roster (
  model TEXT PRIMARY KEY,
  added_at TEXT NOT NULL,
  retired_at TEXT
);
-- One row per run slot: a revision, a model, a harness version, a condition (experiment arms,
-- canonical JSON) and a try. A slot is claimed with a fresh run id each time it runs; a harness
-- failure (sandbox, network, the machine) leaves it to run again, a model's result never does.
CREATE TABLE model_runs (
  revision TEXT NOT NULL,
  challenge_key TEXT NOT NULL,
  model TEXT NOT NULL,
  harness_version TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT '{}',
  try INTEGER NOT NULL CHECK(try > 0),
  status TEXT NOT NULL CHECK(status IN ('queued','running','finished','harness-failed')),
  run_id TEXT UNIQUE,
  outcome TEXT CHECK(outcome IN ('completed','stopped','budget','refused','error')),
  reason TEXT,
  turns INTEGER,
  submissions INTEGER,
  harness_attempts INTEGER NOT NULL DEFAULT 0,
  harness_error TEXT,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (revision, model, harness_version, condition, try),
  CHECK ((status = 'finished') = (outcome IS NOT NULL))
);
CREATE INDEX model_runs_queue ON model_runs(status, queued_at);
CREATE TRIGGER model_runs_finished_stay BEFORE UPDATE ON model_runs
WHEN OLD.status = 'finished'
BEGIN SELECT RAISE(ABORT, 'a finished run is a result'); END;
