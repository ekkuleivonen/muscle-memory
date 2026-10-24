# Telemetry: getting recorded practice to us

Everything the IDE and the tracker record ([workspace](workspace.md), [board activity](board-activity.md)) is stored on the device first, then uploaded. Players' game state never leaves the browser in any other way; the server only collects records.

```text
browser (IndexedDB) ──outbox──▶ ingest Worker ──▶ Pipelines stream ──▶ Iceberg table (Parquet in R2)
                                     │
                                     └──▶ R2 control bucket: participant proofs, deletion tombstones
```

## In the browser

- **Outbox.** `packages/browser/practice-store.ts` (IndexedDB version 4) queues every new record in the same transaction that stores it, in write order. Records already stored when the outbox arrived were queued by the upgrade.
- **Uploader.** `packages/browser/uploader.ts` sends the oldest records first, every 10 seconds, in gzipped batches of up to 500 records or 1 MB of payload, 10 batches a round at most. When the page is hidden it sends one more small batch with `keepalive`. Only a successful reply removes records from the outbox; the records themselves stay on the device. Any failure keeps them and backs off (10 s, doubling, up to 5 minutes). It runs only while the current Terms are accepted, and only when the app was built with `NEXT_PUBLIC_INGEST_URL` (`/ingest` in production).
- **Ownership.** With the participant ID the device keeps a random secret. Every batch carries its SHA-256 (the proof); the server keeps the first proof it sees for an ID and refuses any other, so nobody can add records under someone else's ID. Deleting needs the secret itself. On plain-HTTP LAN development pages, which have no Web Crypto, a small SHA-256 implementation stands in.
- **Reset and delete.** Settings → reset clears records and the outbox but keeps the identity and secret, so uploaded data stays deletable. Settings → delete asks the server to erase first and stops if the server cannot confirm, so the secret is never forgotten while records are on the server.

## The ingest Worker

`apps/ingest` serves `musclememory.run/ingest/*`: same origin as the app, behind the same Access gate during the owner preview.

- `POST /ingest/v1/batches`: a batch (`packages/domain/ingest.ts`). The whole batch is refused (400) only if its shape is wrong; single records are checked one by one and refused with a reason in a successful reply (another participant, an unknown capture version, a payload that does not match its envelope). Only the current capture versions are accepted.
- `POST /ingest/v1/participants/<id>/delete` with `{ "secret": … }`: writes a tombstone (`deleted/<id>` in the control bucket), after which uploads for that ID get 410 and the uploader stops.
- Each accepted record becomes one row (`EventRow`): the envelope as columns (`record_id`, `kind`, `participant_id`, `received_at`, `type`, `capture_version`, `source_id`, `sequence`, `occurred_at`, `elapsed_ms`, `issue`, `issue_revision`, `consent_version`) and `payload`, the record exactly as the device stored it. The table therefore is the raw archive too: anything can be re-derived from `payload`.

## Setting it up (not done yet)

Creating these touches the Cloudflare account, so it is done by hand:

1. `npx wrangler r2 bucket create muscle-memory-control` and `npx wrangler r2 bucket create muscle-memory-events`, and enable R2 Data Catalog on the events bucket.
2. `npx wrangler pipelines setup --name muscle-memory-events`: a stream with the schema in `apps/ingest/events.schema.json` and no public HTTP endpoint (the Worker binding writes to it), an Iceberg sink into the events bucket (Parquet, zstd, table `events`), and `INSERT INTO <sink> SELECT * FROM <stream>`.
3. Put the stream id in `apps/ingest/wrangler.jsonc`, then `npx wrangler deploy --config apps/ingest/wrangler.jsonc`.
4. Build the app with `NEXT_PUBLIC_INGEST_URL=/ingest`.

Wrangler needs Node.js 22.

## Local development

```sh
npx wrangler dev --config apps/ingest/wrangler.jsonc --env local --port 8787
NEXT_PUBLIC_INGEST_URL=http://localhost:8787/ingest npm run dev --workspace apps/web
```

Without a stream, the Worker writes each batch's rows as NDJSON to `dev-events/<date>/<participant>/` in the local control bucket.

## Analysing

Query the Iceberg table with R2 SQL, or with DuckDB (Iceberg and S3 extensions, R2 credentials) from a laptop. Retried uploads can deliver a record twice, so deduplicate on `record_id`:

```sql
SELECT DISTINCT ON (record_id) * FROM events;
```

Unpack the payload with JSON functions, for example the key events of one session:

```sql
SELECT unnest(from_json(json_extract(payload, '$.data.keys'), '["json"]')) AS key
FROM events
WHERE type = 'observation.workspace.keys' AND source_id = 'workspace-…'
ORDER BY sequence;
```

Typed tables (keys one per row, edits, runs) come later as transforms of this one; the payload keeps them possible.

## Erasure (not built yet)

A tombstone stops new data at once. Removing what is already stored needs a scheduled job that deletes the tombstoned participants' rows from the Iceberg table (row-level deletes, for example with PyIceberg) and then expires old snapshots, within the 30 days the Privacy Notice promises. Until that job exists, erasure requests are done by hand from the tombstone list.

## Not yet

- Rate limiting and abuse checks beyond validation (Cloudflare rate limiting rules on `/ingest/*`).
- The erasure job above.
- Typed derived tables.
