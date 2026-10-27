"""Physical-execution check of the fixed cohort query with public synthetic fixtures (ENG-374).

DataFusion 50.1.0 with Python stand-ins for Basin's json_get_str/json_get_json, compared with
SQLite. It proves DataFusion can plan and run the query's joins, window functions and
aggregates. It is not a live Basin run: the native JSON functions and their text output
('[]', 'true', 'false') still need one authenticated workbench check before enabling.
"""
import json
import sqlite3
import sys

import datafusion
import pyarrow as pa

fields = ["received_at","record_id", "type", "participant_id", "attempt_id", "challenge", "challenge_revision", "occurred_at", "kind", "payload"]


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


cases = json.load(sys.stdin)
for case in cases:
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
    sql.execute("CREATE TABLE events (" + ",".join(f + " TEXT" for f in fields) + ")")
    sql.executemany("INSERT INTO events VALUES (" + ",".join("?" for _ in fields) + ")",
                    [[event[f] for f in fields] for event in case["events"]])
    expected = [dict(row) for row in sql.execute(case["query"].replace("default.events", "events"))]
    normalize = lambda rows: sorted(json.dumps({k: (int(v) if isinstance(v, bool) else v) for k, v in row.items()}, sort_keys=True) for row in rows)
    assert normalize(actual) == normalize(expected), (case["name"], actual, expected)
    assert sum(int(r["browsers"]) for r in actual) == case["browsers"], (case["name"], actual)
    sql.close()
print(json.dumps({"passed": len(cases)}))
