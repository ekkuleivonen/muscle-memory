"""Physical-plan regression with public synthetic fixtures, never live data/credentials.

Install datafusion==50.1.0 in a temporary environment, then run the TS driver.
This is a DataFusion compatibility check, not a claim to pin Cloudflare's engine version.
"""
import json
import sqlite3
import sys
import time
import resource
measurements = []

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
    started = time.perf_counter()
    actual = [row for result in ctx.sql(case["query"]).collect() for row in result.to_pylist()]
    elapsed = (time.perf_counter() - started) * 1000
    groups = sum(row["scope"] == "attempt" for row in actual)
    more = sum(row["scope"] == "continuation" for row in actual)
    payloads = [row["payload"] for row in actual if row["scope"] == "observation"]
    assert len(payloads) <= 50000 and sum(len(v.encode("utf-8")) for v in payloads) <= 6*1024*1024
    if case.get("expected"):
        assert {"attempts":groups,"continuation":more} == case["expected"], "Wrong bounded batch prefix."
    measurements.append({"inputRows":len(case["events"]),"returnedObservations":len(payloads),"attempts":groups,"continuation":more,"queryMs":round(elapsed,2),"encodedResponseBytes":len(json.dumps({"success":True,"result":{"rows":actual}}).encode("utf-8"))})
    sql = sqlite3.connect(":memory:")
    sql.row_factory = sqlite3.Row
    sql.create_function("octet_length", 1, lambda v: len(v.encode("utf-8")) if v is not None else None)
    sql.execute("CREATE TABLE events (" + ",".join(field + " TEXT" for field in fields) + ")")
    sql.executemany("INSERT INTO events VALUES (" + ",".join("?" for _ in fields) + ")",
                    [[event[field] for field in fields] for event in case["events"]])
    expected = [dict(row) for row in sql.execute(case["query"].replace("default.events", "events"))]
    # UNION ALL row ordering is deliberately unspecified; content and cardinality must agree.
    normalize = lambda rows: sorted(json.dumps(row, sort_keys=True) for row in rows)
    assert normalize(actual) == normalize(expected), "Synthetic history query semantics differ."
    sql.close()
print(json.dumps({"passed": len(cases), "measurements": measurements, "peakRss":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))
