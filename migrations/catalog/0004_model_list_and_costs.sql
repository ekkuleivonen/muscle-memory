-- Model list and run costs (docs/model-runs.md). Applying this to production requires explicit approval.
-- The models the admin covers, each shown with every reasoning level its listing offers; which
-- levels run is model_roster. A run's cost is what its responses reported, summed when it is
-- handed in. A `default` target becomes the level its model names as default when this is
-- applied (a data step, not part of this file): the roster names real levels only.
CREATE TABLE model_list (
  model TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);
INSERT OR IGNORE INTO model_list (model, added_at)
  SELECT model, MIN(added_at) FROM model_roster GROUP BY model;
INSERT OR IGNORE INTO model_list (model, added_at)
  SELECT model, MIN(queued_at) FROM model_runs GROUP BY model;
ALTER TABLE model_runs ADD COLUMN cost REAL;
