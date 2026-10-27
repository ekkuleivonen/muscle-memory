"""
Appends model-run outbox files to their Iceberg table (docs/model-runs.md), in the same R2
Data Catalog as the events table but never in it: `default.model_events` for runs, with the
events table's columns (apps/ingest/events.schema.json), and `default.model_catalog` for the
daily price snapshots (tools/model-runs/catalog.schema.json). Each `<name>.ndjson` file is appended in
one commit, then moved to `stored/`. A file whose first row is already in the table was
appended before the move failed; it is moved without appending again.

    python store_events.py runs <outbox>       # default.model_events
    python store_events.py catalog <outbox>    # default.model_catalog

Environment: CATALOG_URI, WAREHOUSE, CATALOG_TOKEN (R2 Data Catalog).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

TABLES = {
    "runs": ("default.model_events", ROOT / "apps/ingest/events.schema.json", "record_id"),
    "catalog": ("default.model_catalog", ROOT / "tools/model-runs/catalog.schema.json", "snapshot_id"),
}


def schema(path: Path):
    """An Iceberg schema from a Pipelines stream schema file."""
    from pyiceberg.schema import Schema
    from pyiceberg.types import DoubleType, LongType, NestedField, StringType

    fields = json.loads(path.read_text())["fields"]
    types = {"string": StringType(), "int64": LongType(), "float64": DoubleType()}
    return Schema(
        *(
            NestedField(i + 1, f["name"], types[f["type"]], required=f["required"])
            for i, f in enumerate(fields)
        )
    )


def table_for(catalog, name: str, table_schema):
    """The table, created on first use."""
    namespace = name.split(".")[0]
    if (namespace,) not in catalog.list_namespaces():
        catalog.create_namespace(namespace)
    return catalog.create_table_if_not_exists(name, schema=table_schema)


def append(table, outbox: Path, key: str) -> list[str]:
    """Appends every finished outbox file; returns the names stored."""
    import pyarrow as pa
    from pyiceberg.expressions import EqualTo

    stored_dir = outbox / "stored"
    stored_dir.mkdir(exist_ok=True)
    arrow_schema = table.schema().as_arrow()
    done: list[str] = []
    for path in sorted(outbox.glob("*.ndjson")):
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if rows:
            table.refresh()
            present = table.scan(row_filter=EqualTo(key, rows[0][key]), selected_fields=(key,)).to_arrow()
            if present.num_rows == 0:
                columns = {f.name: [row.get(f.name) for row in rows] for f in arrow_schema}
                table.append(pa.Table.from_pydict(columns, schema=arrow_schema))
        path.rename(stored_dir / path.name)
        done.append(path.name)
    return done


def main() -> int:
    from pyiceberg.catalog.rest import RestCatalog

    if len(sys.argv) != 3 or sys.argv[1] not in TABLES:
        print(__doc__)
        return 2
    name, schema_path, key = TABLES[sys.argv[1]]
    env = os.environ
    catalog = RestCatalog(
        name="events", uri=env["CATALOG_URI"], warehouse=env["WAREHOUSE"], token=env["CATALOG_TOKEN"]
    )
    table = table_for(catalog, name, schema(schema_path))
    done = append(table, Path(sys.argv[2]), key)
    print(f"Stored {len(done)} files in {name}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
