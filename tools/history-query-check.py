"""Physical-plan regression with public synthetic fixtures, never live data/credentials.

Install datafusion==50.1.0 in a temporary environment, then run the TS driver.
This is a DataFusion compatibility check, not a claim to pin Cloudflare's engine version.
"""
import json
import sqlite3
import sys

import datafusion
import pyarrow as pa

fields = ["record_id", "participant_id", "kind", "payload", "type", "attempt_id", "occurred_at"]
cases = json.load(sys.stdin)
for case in cases:
    ctx = datafusion.SessionContext()
    ctx.sql("CREATE SCHEMA default").collect()
    batch = pa.record_batch(
        [pa.array([event[field] for event in case["events"]], type=pa.string()) for field in fields],
        names=fields,
    )
    ctx.register_record_batches("default.events", [[batch]])
    actual = [row for result in ctx.sql(case["query"]).collect() for row in result.to_pylist()]
    sql = sqlite3.connect(":memory:")
    sql.row_factory = sqlite3.Row
    sql.execute("CREATE TABLE events (" + ",".join(field + " TEXT" for field in fields) + ")")
    sql.executemany("INSERT INTO events VALUES (" + ",".join("?" for _ in fields) + ")",
                    [[event[field] for field in fields] for event in case["events"]])
    expected = [dict(row) for row in sql.execute(case["query"].replace("default.events", "events"))]
    # UNION ALL row ordering is deliberately unspecified; content and cardinality must agree.
    normalize = lambda rows: sorted(json.dumps(row, sort_keys=True) for row in rows)
    assert normalize(actual) == normalize(expected), "Synthetic history query semantics differ."
    sql.close()
print(json.dumps({"passed": len(cases)}))
