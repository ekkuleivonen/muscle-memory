-- Model-run targets (docs/model-runs.md). Applying this to production requires explicit approval.
-- The roster becomes what to cover: a model at a reasoning effort. Every target is run on every
-- live challenge revision, with the current harness, a fixed number of tries. The old roster
-- (one row per model) was empty when this replaced it.
DROP TABLE model_roster;
CREATE TABLE model_roster (
  model TEXT NOT NULL,
  effort TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (model, effort)
);
