"""
Aggregates: what the result card compares a player with (docs/play.md). Daily, it reads every
`observation.board.result` from the events table, keeps each participant's first finish of
each issue, leaves out stealth players (their latest profile answer says stealth) and anyone
who asked for deletion, and writes percentiles per issue to `aggregates/v1.json` in the
control bucket, which the ingest Worker serves. Nobody is listed: only counts and quantiles.

Environment: as tools/erasure/erase.py (CATALOG_URI, WAREHOUSE, CATALOG_TOKEN, EVENTS_TABLE,
R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CONTROL_BUCKET).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

# Quantiles kept per metric: 0, 1, …, 100 percent.
POINTS = 101
# The card's metrics compared with others; lower is better for time, higher for speed.
METRICS = ("t", "w")


def quantiles(values: list[float]) -> list[float]:
    """The 0th to 100th percentiles, by linear interpolation."""
    ordered = sorted(values)
    if len(ordered) == 1:
        return [ordered[0]] * POINTS
    out = []
    for i in range(POINTS):
        position = (len(ordered) - 1) * i / (POINTS - 1)
        low = int(position)
        high = min(low + 1, len(ordered) - 1)
        out.append(round(ordered[low] + (ordered[high] - ordered[low]) * (position - low), 3))
    return out


def summarize(rows: list[dict], excluded: set[str]) -> dict:
    """
    rows: {participant_id, type, occurred_at, payload} for result and profile observations.
    Returns {issueKey: {n, language, t: [...], w: [...]}}.
    """
    stealth: dict[str, tuple[str, bool]] = {}
    first: dict[tuple[str, str], tuple[str, dict]] = {}
    for row in rows:
        participant = row["participant_id"]
        if participant in excluded:
            continue
        value = json.loads(row["payload"])
        data = value.get("data", {})
        when = row["occurred_at"] or ""
        if row["type"] == "observation.board.profile":
            answers = data.get("answers") or {}
            if "stealth" in answers:
                previous = stealth.get(participant)
                if previous is None or when > previous[0]:
                    stealth[participant] = (when, bool(answers["stealth"]))
        elif row["type"] == "observation.board.result" and data.get("metrics") == 2:
            key = (participant, data.get("issueKey", ""))
            if key not in first or when < first[key][0]:
                first[key] = (when, data)
    issues: dict[str, dict] = {}
    for (participant, issue), (_, data) in first.items():
        if stealth.get(participant, ("", False))[1]:
            continue
        entry = issues.setdefault(issue, {"language": data.get("language"), "values": {m: [] for m in METRICS}})
        for metric in METRICS:
            v = (data.get("values") or {}).get(metric)
            if isinstance(v, (int, float)) and (metric != "w" or v > 0):
                entry["values"][metric].append(v)
    return {
        issue: {
            "n": len(entry["values"]["t"]),
            "language": entry["language"],
            **{m: quantiles(vs) for m, vs in entry["values"].items() if vs},
        }
        for issue, entry in issues.items()
        if entry["values"]["t"]
    }


def main() -> int:
    import boto3
    from pyiceberg.catalog.rest import RestCatalog
    from pyiceberg.expressions import In

    env = os.environ
    s3 = boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = env["CONTROL_BUCKET"]
    excluded = set()
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix="deleted/"):
        excluded.update(item["Key"].removeprefix("deleted/") for item in page.get("Contents", []))
    catalog = RestCatalog(
        name="events", uri=env["CATALOG_URI"], warehouse=env["WAREHOUSE"], token=env["CATALOG_TOKEN"]
    )
    table = catalog.load_table(env.get("EVENTS_TABLE", "default.events"))
    rows = table.scan(
        row_filter=In("type", ["observation.board.result", "observation.board.profile"]),
        selected_fields=("participant_id", "type", "occurred_at", "payload"),
    ).to_arrow().to_pylist()
    # A retried upload can deliver a record twice; the first finish is unaffected by that.
    issues = summarize(rows, excluded)
    body = {"version": 1, "generatedAt": datetime.now(timezone.utc).isoformat(), "issues": issues}
    s3.put_object(
        Bucket=bucket,
        Key="aggregates/v1.json",
        Body=json.dumps(body).encode(),
        ContentType="application/json",
    )
    print(f"Aggregates for {len(issues)} issues from {len(rows)} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
