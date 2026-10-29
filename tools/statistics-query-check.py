"""Synthetic-only physical planning regression for the admin fixed aggregate SELECT.

DataFusion 50.1.0, using Python stand-ins for Basin JSON functions. The TS driver
compares every result with SQLite and its expected counts. No credentials or live rows.
"""
import json
import sys

import datafusion
import pyarrow as pa

value = json.load(sys.stdin)
ctx = datafusion.SessionContext()
ctx.sql("CREATE SCHEMA default").collect()


def get(doc, key):
    try:
        parsed = json.loads(doc)
        return parsed.get(key) if isinstance(parsed, dict) else None
    except (TypeError, ValueError):
        return None


def get_str(doc, key):
    result = get(doc, key)
    return result if isinstance(result, str) else None


def get_json(doc, key):
    if doc is not None and len(doc.encode("utf-8")) > 2000:
        raise ValueError("JSON input exceeds 2000 bytes")
    result = get(doc, key)
    return None if result is None else json.dumps(result, separators=(",", ":"))


def vectorized(fn):
    return lambda docs, keys: pa.array(
        [fn(doc, key) for doc, key in zip(docs.to_pylist(), keys.to_pylist())],
        type=pa.string(),
    )


for name, fn in (("json_get_str", get_str), ("json_get_json", get_json)):
    ctx.register_udf(datafusion.udf(
        vectorized(fn), [pa.string(), pa.string()], pa.string(), "immutable", name=name,
    ))
fields = value["fields"]
batch = pa.record_batch(
    [pa.array([row.get(field) for row in value["rows"]], type=pa.string()) for field in fields],
    names=fields,
)
ctx.register_record_batches("default.events", [[batch]])
rows = [row for batch in ctx.sql(value["sql"]).collect() for row in batch.to_pylist()]
print(json.dumps(rows))
