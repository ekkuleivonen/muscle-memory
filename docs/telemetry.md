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

- `POST /ingest/v1/batches`: a batch (`packages/domain/ingest.ts`). The whole batch is refused (400) only if its shape is wrong; single records are checked one by one and refused with a reason in a successful reply (another participant, an unknown capture version, a payload that does not match its envelope). Only the current capture versions are accepted, plus the earlier board versions devices may still hold in their outbox (`board-capture-7.1.0`, `7.0.0`, `6.1.0`, `6.0.0`; current board capture is `7.2.0`); each record keeps the meaning of its own version. Release the ingest Worker with the shared domain package before the app whenever a capture version changes, or the new version's records are refused.
- **Rate limits** (Workers rate limiting bindings, approximate and per Cloudflare location): 600 requests a minute per address, checked before the body is read, and 120 a minute per participant (the uploader sends at most 60 while draining a backlog). Over a limit the reply is 429 with `Retry-After: 60`, and the device keeps its records and backs off.
- `GET /ingest/v1/aggregates`: the percentiles result cards compare with, made daily by `tools/aggregates/aggregate.py` ([the five-minute test](play.md)).
- `POST /ingest/v1/participants/<id>/delete` with `{ "secret": … }`: writes a tombstone (`deleted/<id>` in the control bucket), after which uploads for that ID get 410 and the uploader stops.
- Each accepted record becomes one row (`EventRow`): the envelope as columns (`record_id`, `kind`, `participant_id`, `received_at`, `type`, `capture_version`, `source_id`, `sequence`, `occurred_at`, `elapsed_ms`, `issue`, `issue_revision`, `consent_version`) and `payload`, the record exactly as the device stored it. The table therefore is the raw archive too: anything can be re-derived from `payload`.

## Setup

Created on the Cloudflare account that hosts the app (`166fd3dff06a9c3f1aef172a25db7ace`, Workers Paid, which Pipelines needs):

- R2 buckets `muscle-memory-control` and `muscle-memory-events`, with R2 Data Catalog on the events bucket (warehouse `166fd3dff06a9c3f1aef172a25db7ace_muscle-memory-events`) and snapshot expiration (older than 7 days, keeping the last 10).
- Stream `muscle_memory_events` (id `4ccd18f15b5845159747f7c4f42a5c5e`, schema `apps/ingest/events.schema.json`, no HTTP endpoint), sink `muscle_memory_events_iceberg` (Iceberg table `default.events`, Parquet with zstd, a file every 5 minutes) and pipeline `muscle_memory_events_pipeline` (`INSERT INTO muscle_memory_events_iceberg SELECT * FROM muscle_memory_events`).
- The Worker `muscle-memory-ingest` on the route `musclememory.run/ingest/*`. A route takes precedence over the app's Custom Domain on the same hostname, and Cloudflare Access covers it like the rest of the hostname.
- An R2 API token (Admin Read & Write, which Data Catalog needs) for the sink and the erasure job, stored as the repository secrets `R2_CATALOG_TOKEN`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, with `R2_CATALOG_URI`, `R2_WAREHOUSE` and `R2_ENDPOINT`.
- The app is built with `NEXT_PUBLIC_INGEST_URL=/ingest` (`apps/web/.env.production`).

To deploy the Worker after a change: `npx wrangler deploy --config apps/ingest/wrangler.jsonc --env=""`. Wrangler needs Node.js 22.

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

## Erasure

A deletion request writes a tombstone, `deleted/<participant>`, in the control bucket, and the Worker refuses that participant's uploads from then on. `tools/erasure/erase.py` runs daily (`.github/workflows/erasure.yml`, also on demand) over every tombstone:

- It deletes the participants' rows from the events table with PyIceberg, in chunks of 500, retrying when a commit races the pipeline's own appends. Iceberg rewrites the affected Parquet files without those rows.
- It records each erasure that removed rows as `erased/<participant>/<time>.json`, with the count.
- R2 Data Catalog's snapshot expiration (7 days, keeping the last 10 snapshots) then removes the old files that still held the rows, so erased data is physically gone about a week after the request, inside the 30 days the Privacy Notice promises.

Running over every tombstone each day catches rows the pipeline was still holding when the request came. `tools/erasure/test_erase.py` runs the same code against a local Iceberg catalog in CI.

## Not yet

- Abuse checks beyond validation and rate limits, such as spotting impossible timing in a stream.
- Typed derived tables.
