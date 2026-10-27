"""
Appends model-run outbox files to their Iceberg table (docs/model-runs.md), in the same R2
Data Catalog as the events table but never in it: `default.model_events` for runs, with the
events table's columns (apps/ingest/events.schema.json), and `default.model_catalog` for the
daily price snapshots (tools/model-runs/catalog.schema.json). Each `<name>.ndjson` file is appended in
one commit, then moved to `stored/`. A file whose first row is already in the table was
appended before the move failed; it is moved without appending again.

    python store_events.py runs <outbox>       # default.model_events
    python store_events.py catalog <outbox>    # default.model_catalog
    python store_events.py runs-r2 <bucket>    # the admin's finished runs, from private R2

Runs from the admin are in `model-runs/outbox/` in the private content bucket; `runs-r2` pulls
them into a local outbox, appends them, and moves each stored object to `model-runs/stored/`.

Environment: CATALOG_URI, WAREHOUSE, CATALOG_TOKEN (R2 Data Catalog); for runs-r2 also
R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
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


R2_OUTBOX = "model-runs/outbox/"
R2_STORED = "model-runs/stored/"


def pull(s3, bucket: str, outbox: Path) -> list[str]:
    """Downloads every finished run in the bucket's outbox; returns their keys."""
    outbox.mkdir(parents=True, exist_ok=True)
    keys: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=R2_OUTBOX):
        for item in page.get("Contents", []):
            name = item["Key"].removeprefix(R2_OUTBOX)
            if not name.endswith(".ndjson") or "/" in name:
                continue
            body = s3.get_object(Bucket=bucket, Key=item["Key"])["Body"].read()
            (outbox / name).write_bytes(body)
            keys.append(item["Key"])
    return keys


def mark_stored(s3, bucket: str, names: list[str]) -> None:
    """Moves stored runs out of the bucket's outbox."""
    for name in names:
        source = R2_OUTBOX + name
        s3.copy_object(Bucket=bucket, Key=R2_STORED + name, CopySource={"Bucket": bucket, "Key": source})
        s3.delete_object(Bucket=bucket, Key=source)


def main() -> int:
    from pyiceberg.catalog.rest import RestCatalog

    mode = sys.argv[1] if len(sys.argv) == 3 else ""
    if mode not in (*TABLES, "runs-r2"):
        print(__doc__)
        return 2
    name, schema_path, key = TABLES["runs" if mode == "runs-r2" else mode]
    env = os.environ
    catalog = RestCatalog(
        name="events", uri=env["CATALOG_URI"], warehouse=env["WAREHOUSE"], token=env["CATALOG_TOKEN"]
    )
    table = table_for(catalog, name, schema(schema_path))
    if mode == "runs-r2":
        import tempfile

        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=env["R2_ENDPOINT"],
            aws_access_key_id=env["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        bucket = sys.argv[2]
        with tempfile.TemporaryDirectory() as scratch:
            pull(s3, bucket, Path(scratch))
            done = append(table, Path(scratch), key)
            mark_stored(s3, bucket, done)
    else:
        done = append(table, Path(sys.argv[2]), key)
    print(f"Stored {len(done)} files in {name}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
