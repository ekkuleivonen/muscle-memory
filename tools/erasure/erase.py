"""
Erasure: removes the rows of every participant who deleted their account from the events
table (docs/telemetry.md). The ingest Worker writes a tombstone, `deleted/<participant>`, to the
control bucket and refuses further uploads at once; this job, run daily, deletes those
participants' rows from the Iceberg table. The rewritten Parquet files no longer hold them, and
R2 Data Catalog's snapshot expiration removes the old files within its window, so erased rows
are physically gone within about a week of the request, inside the 30 days the Privacy Notice
promises. Each erasure is recorded as `erased/<participant>/<time>.json` with the rows removed.

It runs every day over every tombstone, not only new ones, so rows still in flight when the
request came (buffered by the pipeline) are caught on a later run.

Environment: CATALOG_URI, WAREHOUSE, CATALOG_TOKEN (R2 Data Catalog), EVENTS_TABLE (default
"default.events"), R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CONTROL_BUCKET.
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone

CHUNK = 500
ATTEMPTS = 5


def tombstones(s3, bucket: str) -> list[str]:
    """Participant IDs with a deletion tombstone."""
    ids: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix="deleted/"):
        for item in page.get("Contents", []):
            ids.append(item["Key"].removeprefix("deleted/"))
    return sorted(ids)


def erase(table, participant_ids: list[str]) -> Counter:
    """
    Deletes every row of these participants; returns the rows removed per participant. A commit
    can race the pipeline's own appends, so each chunk is retried on a fresh view of the table.
    """
    from pyiceberg.exceptions import CommitFailedException
    from pyiceberg.expressions import In

    removed: Counter = Counter()
    for start in range(0, len(participant_ids), CHUNK):
        chunk = participant_ids[start : start + CHUNK]
        condition = In("participant_id", chunk)
        for attempt in range(1, ATTEMPTS + 1):
            try:
                table.refresh()
                found = table.scan(row_filter=condition, selected_fields=("participant_id",)).to_arrow()
                counts = Counter(found.column("participant_id").to_pylist())
                if counts:
                    table.delete(delete_filter=condition)
                removed.update(counts)
                break
            except CommitFailedException:
                if attempt == ATTEMPTS:
                    raise
                time.sleep(2**attempt)
    return removed


def record(s3, bucket: str, removed: Counter, now: datetime) -> None:
    """Notes each erasure that removed rows, next to the tombstone, for the audit trail."""
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    for participant, rows in removed.items():
        s3.put_object(
            Bucket=bucket,
            Key=f"erased/{participant}/{stamp}.json",
            Body=json.dumps({"erasedAt": now.isoformat(), "rows": rows}).encode(),
            ContentType="application/json",
        )


def main() -> int:
    import boto3
    from pyiceberg.catalog.rest import RestCatalog

    env = os.environ
    s3 = boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = env["CONTROL_BUCKET"]
    ids = tombstones(s3, bucket)
    if not ids:
        print("No deletion requests.")
        return 0
    catalog = RestCatalog(
        name="events", uri=env["CATALOG_URI"], warehouse=env["WAREHOUSE"], token=env["CATALOG_TOKEN"]
    )
    table = catalog.load_table(env.get("EVENTS_TABLE", "default.events"))
    removed = erase(table, ids)
    record(s3, bucket, removed, datetime.now(timezone.utc))
    print(f"{len(ids)} deletion requests; removed {sum(removed.values())} rows of {len(removed)} participants.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
