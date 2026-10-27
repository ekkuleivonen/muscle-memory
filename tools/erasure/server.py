"""
The erasure job's container (apps/erasure): one endpoint the erasure Worker calls once a day.

    POST /erase   {"participants": [...]}  ->  {"removed": {participant: rows}}

The Worker reaches it only through its Durable Object; it has no public address. Anything that
goes wrong is a 500 with the error, so the Worker records nothing and the next run tries again.
"""
from __future__ import annotations

import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import erase

MAX_BODY = 4_000_000


def handle(body: bytes, table_loader=erase.load_table) -> tuple[int, dict]:
    """The reply to one erase request, as status and JSON body."""
    try:
        participants = json.loads(body)["participants"]
        if not isinstance(participants, list) or not all(isinstance(p, str) for p in participants):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        return 400, {"error": "Expected {\"participants\": [\"...\"]}."}
    if not participants:
        return 200, {"removed": {}}
    removed = erase.erase(table_loader(), sorted(set(participants)))
    return 200, {"removed": dict(removed)}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/erase":
            return self.reply(404, {"error": "Not found."})
        length = int(self.headers.get("content-length") or 0)
        if length > MAX_BODY:
            return self.reply(413, {"error": "Too large."})
        try:
            status, body = handle(self.rfile.read(length))
        except Exception as cause:  # noqa: BLE001 - reported to the Worker, which retries tomorrow
            traceback.print_exc()
            status, body = 500, {"error": f"{type(cause).__name__}: {cause}"}
        self.reply(status, body)

    def do_GET(self):
        self.reply(200, {"ok": True})

    def reply(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        sys.stderr.write("%s\n" % (format % args))


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
