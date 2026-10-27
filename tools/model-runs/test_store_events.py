"""Appends outbox files to a local Iceberg catalog (SQLite and files), as the job does to R2's."""
import json
import tempfile
import unittest
from pathlib import Path

from pyiceberg.catalog.sql import SqlCatalog

import store_events


def row(record_id: str, session: str) -> dict:
    return {
        "record_id": record_id,
        "kind": "observation",
        "participant_id": "model:test_model",
        "received_at": "2026-10-27T10:00:00Z",
        "country": None,
        "type": "model.ended",
        "capture_version": "model-capture-1.0.0",
        "session_id": session,
        "source_id": "model-1",
        "sequence": 1,
        "occurred_at": "2026-10-27T10:00:00Z",
        "elapsed_ms": 1.5,
        "challenge": "PY-001",
        "challenge_revision": "sha256:" + "a" * 64,
        "attempt_id": "attempt-1",
        "terms_version": None,
        "payload": "{}",
    }


class StoreTest(unittest.TestCase):
    def test_outbox_files_are_appended_once_and_moved(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            catalog = SqlCatalog("local", uri=f"sqlite:///{root}/catalog.db", warehouse=f"file://{root}")
            name, schema_path, key = store_events.TABLES["runs"]
            table = store_events.table_for(catalog, name, store_events.schema(schema_path))
            outbox = root / "outbox"
            outbox.mkdir()
            run = [row("model-1.1", "run-1"), row("model-1.2", "run-1")]
            (outbox / "run-1.ndjson").write_text("\n".join(json.dumps(r) for r in run) + "\n")
            (outbox / "run-2.ndjson.partial").write_text(json.dumps(row("model-2.1", "run-2")))

            self.assertEqual(store_events.append(table, outbox, key), ["run-1.ndjson"])
            self.assertEqual(sorted(p.name for p in outbox.iterdir()), ["run-2.ndjson.partial", "stored"])
            ids = table.scan().to_arrow().column("record_id").to_pylist()
            self.assertEqual(sorted(ids), ["model-1.1", "model-1.2"])

            # A file appended before its move failed is moved without appending again.
            (outbox / "stored" / "run-1.ndjson").rename(outbox / "run-1.ndjson")
            self.assertEqual(store_events.append(table, outbox, key), ["run-1.ndjson"])
            self.assertEqual(table.scan().to_arrow().num_rows, 2)

    def test_the_catalog_table_has_its_own_schema(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            catalog = SqlCatalog("local", uri=f"sqlite:///{root}/catalog.db", warehouse=f"file://{root}")
            name, schema_path, key = store_events.TABLES["catalog"]
            table = store_events.table_for(catalog, name, store_events.schema(schema_path))
            self.assertEqual(name, "default.model_catalog")
            self.assertEqual(table.schema().find_field(key).name, "snapshot_id")


if __name__ == "__main__":
    unittest.main()
