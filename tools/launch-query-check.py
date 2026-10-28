"""Physical-execution check of the generated launch query with public synthetic fixtures (ENG-337).

DataFusion 50.1.0, with its own regexp_like and Python stand-ins for Basin's json_get_str and
json_get_json, compared with SQLite. It proves DataFusion plans and runs the query's CTEs, CASE
aggregates, UNION ALL of NULL-padded branches and text comparisons on ISO instants. It is
not a live Basin run.
"""
import json
import re
import sqlite3
import sys

import datafusion
import pyarrow as pa


def get(doc, key):
    try:
        value = json.loads(doc)
        return value.get(key) if isinstance(value, dict) else None
    except Exception:
        return None


def get_str(doc, key):
    value = get(doc, key)
    return value if isinstance(value, str) else None


def get_json(doc, key):
    value = get(doc, key)
    return None if value is None else json.dumps(value, separators=(",", ":"))


def vectorized(fn):
    return lambda docs, keys: pa.array([fn(d, k) for d, k in zip(docs.to_pylist(), keys.to_pylist())], type=pa.string())


def normalize(rows):
    def value(v):
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return v
    return sorted(json.dumps({k: value(v) for k, v in row.items()}, sort_keys=True) for row in rows)


cases = json.load(sys.stdin)
for case in cases:
    fields = case["fields"]
    ctx = datafusion.SessionContext()
    ctx.sql("CREATE SCHEMA default").collect()
    for name, fn in (("json_get_str", get_str), ("json_get_json", get_json)):
        ctx.register_udf(datafusion.udf(vectorized(fn), [pa.string(), pa.string()], pa.string(), "immutable", name=name))
    batch = pa.record_batch(
        [pa.array([event[f] for event in case["events"]], type=pa.string()) for f in fields], names=fields
    )
    ctx.register_record_batches("default.events", [[batch]])
    actual = [row for result in ctx.sql(case["query"]).collect() for row in result.to_pylist()]
    sql = sqlite3.connect(":memory:")
    sql.row_factory = sqlite3.Row
    sql.create_function("json_get_str", 2, get_str)
    sql.create_function("json_get_json", 2, get_json)
    sql.create_function("regexp_like", 2, lambda s, p: bool(re.search(p, s)) if s else False)
    sql.execute("CREATE TABLE events (" + ",".join(f + " TEXT" for f in fields) + ")")
    sql.executemany("INSERT INTO events VALUES (" + ",".join("?" for _ in fields) + ")",
                    [[event[f] for f in fields] for event in case["events"]])
    expected = [dict(row) for row in sql.execute(case["query"].replace("default.events", "events"))]
    assert normalize(actual) == normalize(expected), (case["name"], actual, expected)
    launch = [r for r in actual if r["section"] == "launch"]
    assert len(launch) == 1 and int(launch[0]["attempts"] or 0) == case["attempts"], (case["name"], launch)
    sql.close()
print(json.dumps({"passed": len(cases)}))
