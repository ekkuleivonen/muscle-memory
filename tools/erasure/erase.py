"""
Erasure: removes the rows of participants who deleted their account from the events table
(docs/telemetry.md#erasure). The erasure Worker (apps/erasure) runs daily on Cloudflare: it
reads the tombstones (`deleted/<participant>`) the ingest Worker writes, has this code delete
those participants' rows in a Cloudflare Container (server.py), and records each erasure. The
rewritten Parquet files no longer hold the rows, and R2 Data Catalog's snapshot expiration
removes the old files within its window, so erased rows are physically gone within about a
week of the request, inside the 30 days the Privacy Notice promises.

Environment: CATALOG_URI, WAREHOUSE, CATALOG_TOKEN (R2 Data Catalog, which vends the storage
credentials), EVENTS_TABLE (default "default.events").
"""
from __future__ import annotations

import os
import time
from collections import Counter

CHUNK = 500
ATTEMPTS = 5


def load_table(env=os.environ):
    """The events table, from the R2 Data Catalog the environment names."""
    from pyiceberg.catalog.rest import RestCatalog

    catalog = RestCatalog(
        name="events", uri=env["CATALOG_URI"], warehouse=env["WAREHOUSE"], token=env["CATALOG_TOKEN"]
    )
    return catalog.load_table(env.get("EVENTS_TABLE", "default.events"))


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
