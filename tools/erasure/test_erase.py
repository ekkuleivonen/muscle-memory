"""Runs the erasure against a local Iceberg catalog (SQLite and files) with the events schema."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.schema import Schema
from pyiceberg.types import DoubleType, LongType, NestedField, StringType

import erase

ROOT = Path(__file__).resolve().parents[2]


def schema() -> Schema:
    """The table schema, from the stream schema the pipeline is created with."""
    fields = json.loads((ROOT / "apps/ingest/events.schema.json").read_text())["fields"]
    types = {"string": StringType(), "int64": LongType(), "float64": DoubleType()}
    return Schema(
        *(
            NestedField(i + 1, f["name"], types[f["type"]], required=f["required"])
            for i, f in enumerate(fields)
        )
    )


def rows(participant: str, count: int, table_schema: Schema) -> pa.Table:
    data = {f.name: [None] * count for f in table_schema.fields}
    data.update(
        record_id=[f"{participant}-r{i}" for i in range(count)],
        kind=["observation"] * count,
        participant_id=[participant] * count,
        received_at=["2026-10-25T10:00:00Z"] * count,
        type=["observation.workspace.keys"] * count,
        payload=["{}"] * count,
    )
    return pa.Table.from_pydict(data, schema=table_schema.as_arrow())


class FakeS3:
    def __init__(self, keys):
        self.objects = {k: b"{}" for k in keys}

    def get_paginator(self, _):
        objects = self.objects

        class Pages:
            def paginate(self, Bucket, Prefix):
                yield {"Contents": [{"Key": k} for k in sorted(objects) if k.startswith(Prefix)]}

        return Pages()

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body


class ErasureTest(unittest.TestCase):
    def test_tombstoned_participants_lose_every_row_and_others_keep_theirs(self):
        with tempfile.TemporaryDirectory() as warehouse:
            catalog = SqlCatalog(
                "local", uri=f"sqlite:///{warehouse}/catalog.db", warehouse=f"file://{warehouse}"
            )
            catalog.create_namespace("default")
            s = schema()
            table = catalog.create_table("default.events", schema=s)
            for participant, count in (("p-gone", 5), ("p-stays", 3), ("p-also-gone", 2)):
                table.append(rows(participant, count, s))

            s3 = FakeS3(["deleted/p-gone", "deleted/p-also-gone", "deleted/p-never-uploaded"])
            ids = erase.tombstones(s3, "control")
            self.assertEqual(ids, ["p-also-gone", "p-gone", "p-never-uploaded"])

            removed = erase.erase(table, ids)
            self.assertEqual(dict(removed), {"p-gone": 5, "p-also-gone": 2})
            left = table.scan().to_arrow().column("participant_id").to_pylist()
            self.assertEqual(sorted(set(left)), ["p-stays"])
            self.assertEqual(len(left), 3)

            now = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
            erase.record(s3, "control", removed, now)
            self.assertIn("erased/p-gone/20261025T120000Z.json", s3.objects)
            self.assertEqual(json.loads(s3.objects["erased/p-gone/20261025T120000Z.json"])["rows"], 5)

            # A later run finds nothing more to remove, and records nothing.
            again = erase.erase(table, ids)
            self.assertEqual(sum(again.values()), 0)


if __name__ == "__main__":
    unittest.main()
