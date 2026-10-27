"""
Access: answers a data request (Settings → access, docs/telemetry.md). The ingest Worker notes
each request, proven with the device secret, as `access/<reference>.json` in the control bucket;
the person emails us the reference. Run by the operator on their own machine:

    python tools/erasure/access.py MM-XXXX-XXXX request.ndjson

It writes every row the events table holds for that participant, one JSON object per line,
deduplicated on `record_id` and in stream order, to send back. Nothing is uploaded anywhere.

Environment: as erase.py, plus R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY for the
control bucket (CONTROL_BUCKET, default "muscle-memory-control"). Install requirements-access.txt.
"""
from __future__ import annotations

import json
import os
import sys

import erase


def participant(s3, bucket: str, reference: str) -> str:
    """The participant ID a reference was issued for; KeyError when there is no such request."""
    try:
        body = s3.get_object(Bucket=bucket, Key=f"access/{reference}.json")["Body"].read()
    except s3.exceptions.NoSuchKey as missing:
        raise KeyError(reference) from missing
    return json.loads(body)["participantId"]


def rows(table, participant_id: str) -> list[dict]:
    """Every row of this participant, each record once, in stream order."""
    from pyiceberg.expressions import EqualTo

    found = table.scan(row_filter=EqualTo("participant_id", participant_id)).to_arrow().to_pylist()
    unique = {row["record_id"]: row for row in found}
    return sorted(unique.values(), key=lambda row: (row["source_id"] or "", row["sequence"] or 0))


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: access.py <reference> <output.ndjson>", file=sys.stderr)
        return 2
    import boto3

    reference, output = argv[1], argv[2]
    env = os.environ
    s3 = boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = env.get("CONTROL_BUCKET", "muscle-memory-control")
    try:
        participant_id = participant(s3, bucket, reference)
    except KeyError:
        print(f"No request {reference}.", file=sys.stderr)
        return 1
    table = erase.load_table(env)
    found = rows(table, participant_id)
    with open(output, "w", encoding="utf-8") as file:
        for row in found:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"{reference}: wrote {len(found)} rows to {output}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
