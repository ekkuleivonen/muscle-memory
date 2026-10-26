-- Local/draft schema only. Applying this to production requires explicit approval.
PRAGMA foreign_keys = ON;
CREATE TABLE catalog_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  generation INTEGER NOT NULL DEFAULT 0,
  active_object TEXT,
  seeded_at TEXT
);
INSERT INTO catalog_state(singleton) VALUES (1);
CREATE TABLE challenge_heads (
  challenge_key TEXT PRIMARY KEY,
  generation INTEGER NOT NULL CHECK(generation > 0),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('draft','published','archived')),
  published_revision TEXT,
  draft_object TEXT,
  draft_digest TEXT,
  draft_metadata TEXT,
  qa_receipt TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE published_versions (
  revision TEXT PRIMARY KEY,
  challenge_key TEXT NOT NULL REFERENCES challenge_heads(challenge_key),
  object_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  runtime_fingerprint TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE TRIGGER published_versions_immutable_update BEFORE UPDATE ON published_versions
BEGIN SELECT RAISE(ABORT, 'immutable published version'); END;
CREATE TRIGGER published_versions_immutable_delete BEFORE DELETE ON published_versions
BEGIN SELECT RAISE(ABORT, 'immutable published version'); END;
CREATE TABLE qa_receipts (
  receipt_id TEXT PRIMARY KEY,
  challenge_key TEXT NOT NULL REFERENCES challenge_heads(challenge_key),
  draft_digest TEXT NOT NULL,
  runtime_fingerprint TEXT NOT NULL,
  evidence_object TEXT NOT NULL,
  passed_at TEXT NOT NULL
);
CREATE TRIGGER qa_receipts_immutable_update BEFORE UPDATE ON qa_receipts
BEGIN SELECT RAISE(ABORT, 'immutable QA receipt'); END;
CREATE TRIGGER qa_receipts_immutable_delete BEFORE DELETE ON qa_receipts
BEGIN SELECT RAISE(ABORT, 'immutable QA receipt'); END;
-- Publication intent only. ENG-342 defines execution after owner decisions.
CREATE TABLE publication_intents (
  revision TEXT PRIMARY KEY REFERENCES published_versions(revision),
  challenge_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state = 'blocked_configuration'),
  created_at TEXT NOT NULL
);
CREATE TABLE operator_mutations (
  request_id TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  challenge_key TEXT NOT NULL,
  expected_generation INTEGER NOT NULL,
  expected_catalog_generation INTEGER,
  action TEXT NOT NULL CHECK(action IN ('create','edit','validate','validation.start','validation.complete','publish','archive')),
  result_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
-- First statement of every atomic D1 batch: stale operations abort the whole batch.
-- A duplicate request_id also aborts the whole batch; the service reads and returns
-- the original result only when its request_digest matches.
CREATE TRIGGER mutation_generation_guard BEFORE INSERT ON operator_mutations
WHEN NEW.expected_generation <> COALESCE(
  (SELECT generation FROM challenge_heads WHERE challenge_key = NEW.challenge_key), 0)
BEGIN SELECT RAISE(ABORT, 'stale challenge generation'); END;
CREATE TRIGGER mutation_catalog_guard BEFORE INSERT ON operator_mutations
WHEN NEW.expected_catalog_generation IS NOT NULL AND NEW.expected_catalog_generation <>
  (SELECT generation FROM catalog_state WHERE singleton = 1)
BEGIN SELECT RAISE(ABORT, 'stale published catalog'); END;
CREATE TABLE operator_audit (
  audit_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  challenge_key TEXT NOT NULL,
  revision TEXT,
  occurred_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('succeeded','failed')),
  failure_code TEXT
);

CREATE UNIQUE INDEX successful_operation_audit ON operator_audit(request_id) WHERE result = 'succeeded';
CREATE TABLE validation_sessions (
  token TEXT PRIMARY KEY, challenge_key TEXT NOT NULL REFERENCES challenge_heads(challenge_key),
  generation INTEGER NOT NULL, draft_digest TEXT NOT NULL, runtime_fingerprint TEXT NOT NULL,
  expires_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, failure_code TEXT, consumed_at TEXT
);
