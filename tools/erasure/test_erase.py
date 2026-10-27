"""Runs the erasure against a local Iceberg catalog (SQLite and files) with the events schema."""
import json
import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.schema import Schema
from pyiceberg.types import DoubleType, LongType, NestedField, StringType

import access
import erase
import server

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
        source_id=["practice-a"] * count,
        sequence=list(range(count, 0, -1)),
        kind=["observation"] * count,
        participant_id=[participant] * count,
        received_at=["2026-10-25T10:00:00Z"] * count,
        type=["practice.keys"] * count,
        payload=["{}"] * count,
    )
    return pa.Table.from_pydict(data, schema=table_schema.as_arrow())


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

            ids = ["p-also-gone", "p-gone", "p-never-uploaded"]
            removed = erase.erase(table, ids)
            self.assertEqual(dict(removed), {"p-gone": 5, "p-also-gone": 2})
            left = table.scan().to_arrow().column("participant_id").to_pylist()
            self.assertEqual(sorted(set(left)), ["p-stays"])
            self.assertEqual(len(left), 3)

            # A later run finds nothing more to remove, and records nothing.
            again = erase.erase(table, ids)
            self.assertEqual(sum(again.values()), 0)


class ServerTest(unittest.TestCase):
    def test_an_erase_request_is_answered_with_the_rows_removed(self):
        with tempfile.TemporaryDirectory() as warehouse:
            catalog = SqlCatalog(
                "local", uri=f"sqlite:///{warehouse}/catalog.db", warehouse=f"file://{warehouse}"
            )
            catalog.create_namespace("default")
            s = schema()
            table = catalog.create_table("default.events", schema=s)
            table.append(rows("p-gone", 4, s))
            table.append(rows("p-stays", 1, s))
            body = json.dumps({"participants": ["p-gone", "p-gone", "p-never"]}).encode()
            self.assertEqual(server.handle(body, lambda: table), (200, {"removed": {"p-gone": 4}}))
            self.assertEqual(table.scan().to_arrow().column("participant_id").to_pylist(), ["p-stays"])

    def test_malformed_and_empty_requests_never_open_the_catalog(self):
        def never():
            raise AssertionError("catalog opened")

        self.assertEqual(server.handle(b"{}", never)[0], 400)
        self.assertEqual(server.handle(b'{"participants": [1]}', never)[0], 400)
        self.assertEqual(server.handle(b"not json", never)[0], 400)
        self.assertEqual(server.handle(b'{"participants": []}', never), (200, {"removed": {}}))


class AccessTest(unittest.TestCase):
    def test_a_request_gets_that_participants_rows_once_each_in_stream_order(self):
        with tempfile.TemporaryDirectory() as warehouse:
            catalog = SqlCatalog(
                "local", uri=f"sqlite:///{warehouse}/catalog.db", warehouse=f"file://{warehouse}"
            )
            catalog.create_namespace("default")
            s = schema()
            table = catalog.create_table("default.events", schema=s)
            table.append(rows("p-asks", 3, s))
            table.append(rows("p-asks", 3, s))  # a retried upload, delivered twice
            table.append(rows("p-other", 2, s))

            found = access.rows(table, "p-asks")
            self.assertEqual([r["record_id"] for r in found], ["p-asks-r2", "p-asks-r1", "p-asks-r0"])
            self.assertEqual({r["participant_id"] for r in found}, {"p-asks"})


if __name__ == "__main__":
    unittest.main()
