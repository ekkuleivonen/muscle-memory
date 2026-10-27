# What we record, and how it reaches us

Raw event streams are how we learn how developers work. Everything is recorded as it happens, as finely as it happens, and interpreted later: active time, typos, pace and scores are derived from the stream, never stored in it. Nothing is recorded before the current Terms and Privacy Notice are accepted ([legal](legal.md)).

## Evidence before interpretation

- **Immutable content.** Every challenge revision is stored once under the SHA-256 of its content ([challenges](challenges.md)). Recorded data names the revision, so it can always be read against exactly what the person saw.
- **Ordered observations.** Each has a stable ID, its position in its source stream, the wall-clock time and a monotonic clock. Gaps, dropped capture and truncation are recorded, never papered over: a missing position was not observed, which is not evidence that nothing happened.
- **Raw outcomes.** A run keeps its bounded raw outcome (64 KiB per output or file, cut at a character boundary with the byte counts) even when it cannot be scored. Pass counts and verdicts are recomputed from it.
- **Interpretations are versioned elsewhere.** A change to how something is computed is a new interpretation, not an edit to recorded data.

Formats can still be reset freely before launch (root `AGENTS.md`); after launch, a change in what an observation means bumps its stream's capture version.

## The envelope

Every observation (`packages/domain/records.ts`) carries:

| Field | What |
| --- | --- |
| `type` | `practice.*` or `site.*` |
| `observationId` | `<source>.<sequence>`: stable, so retries deduplicate |
| `participantId` | a random ID for this browser, never a person |
| `sessionId` | the page load (`packages/browser/page-session.ts`), shared by every stream recording during it |
| `source` | `{ id, sequence }`: one stream per page load and recorder, positions from 1 with no reuse |
| `occurredAt`, `elapsedMs` | wall clock, and a monotonic clock from the stream's start in 0.1 ms steps |
| `captureVersion` | `practice-capture-1.1.0` or `site-capture-1.0.0` |
| `termsVersion` | the Terms and Privacy Notice version accepted |
| `assignments` | experiment arms in force, by experiment id (`{}` until there are experiments) |
| `challenge`, `challengeRevision` | the challenge's key (such as `PY-003`) and the exact revision, when it is about one |
| `attemptId` | the attempt, for practice |

Code is stored once per revision as an `artifact.code-revision` (the file by its name, bounded) and cited by id.

## The practice stream

Everything inside a challenge at `/challenges/<KEY>` (`packages/domain/practice.ts`, recorded by `apps/web/app/practice/session.ts` through `packages/capture/recorder.ts`). One source stream per page load: `practice-<id>`.

**Attempts.** Practice works in an attempt (`apps/web/lib/progress.ts`). Opening a challenge resumes its attempt; the first open, or a start after the last attempt completed, begins a new one. Every practice observation names its attempt.

| Type | Recorded |
| --- | --- |
| `practice.started` | an attempt began: where from (`picker`, `quick-start`, `link` for a shared result's invitation, `next`, `again`, or `direct` for practice opened by its URL), and for a pick from the list the search then and the position in the list (from 1) |
| `practice.opened` | the code revision and artifact, the app page it was opened from, the profile then, the window size, the environment, the editor's features and keymap, the runtime, and the declared capture gaps |
| `practice.keys` | every key down and up and IME composition in the editor: `[elapsedMs, kind, key, code, modifiers, repeat]`, with both the character typed and the physical key, about a second at a time |
| `practice.edit` | one per document-changing transaction: the CodeMirror change set (up to 16 KiB, else a snapshot), the user event (`input.type`, `input.paste`, `undo`, …), the selection and length |
| `practice.snapshot` | a complete copy of the code, on opening, every 25 edits, after an oversize edit, on every run and after a restore |
| `practice.selection`, `practice.scroll`, `practice.focus` | cursor moves that change no text (bursts within 100 ms merge), the lines in view (merged within 250 ms), the editor gaining or losing focus |
| `practice.clipboard` | a copy or cut in the editor (where, never the clipboard), or text copied from the challenge itself (what, bounded to 4 KiB: it is our text) |
| `practice.assist` | help the editor showed: the type errors displayed, each type tooltip opened by pointer or keyboard (kind `hover`) |
| `practice.run` | `queued`, `running`, then the terminal status with the raw bounded outcome; the run's purpose (`examples` or `submit`), how it was started, the code revision and artifact, runtime and timeout |
| `practice.submitted` | a Submit's verdict: result (`passed`, `failed`, `errored`, `cancelled`), cases passed of total, and the ids of the rules the submitted code fires |
| `practice.completed` | the submission that completed the attempt (every case passed, no rule fired), and the challenge suggested next |
| `practice.answered` | an answer to one of the questions after completing: how hard it was, how sure they were before submitting, whether they would have used AI for it at work |
| `practice.page`, `practice.runtime`, `practice.closed` | the page visible or hidden, focused, resized; the runtime loading, ready or failing; practice left, or the page hidden as it unloads |
| `practice.capture-gap` | an explicit lost range of positions (`buffer-full` or `write-conflict`) |

Practice capture 1.1 adds keyboard access to type tooltips: `practice.assist` kind `hover` now covers pointer and keyboard opening. The opened editor features also name `keyboard-type-info` and `keyboard-diagnostics`.

**The environment** in `opened` is coarse and comparable, never identifying (`apps/web/lib/environment.ts`): browser and OS family, the primary pointer (fine, coarse, none), the browser language, the IANA time zone and UTC offset, what a few physical keys type where Chromium says (enough to tell QWERTY, QWERTZ, AZERTY and Nordic layouts apart).

Keys are heard only on the editor, in the capture phase so keys an editor command consumes are heard too. The clipboard is never read; a paste is the edit it makes.

## The site stream

Everything outside a challenge (`packages/domain/site.ts`, `apps/web/lib/site-log.ts`), one source stream per page load: `site-<id>`.

| Type | Recorded |
| --- | --- |
| `site.viewed` | every page shown: path, query string (searches are recorded as the query they produced, never key by key), and the app page before it; a page about one challenge names it |
| `site.page` | outside practice (which records its own): visible or hidden, focused, resized |
| `site.arrived` | once per browser, after the Terms are accepted: the first landing page and when, and the referral code of the shared link that brought them |
| `site.profile` | the whole profile as saved after an answer, and where it was given (`settings`, or `quick-start` for the language picked, a guess) ([profile](profile.md)) |
| `site.shared` | a result card shared: the channel, the card and this device's referral code |
| `site.starred`, `site.unstarred` | a star toggled, and where (`picker` or `practice`) |

## Declared gaps

Not recorded: visits before the Terms are accepted, keystrokes in text fields other than the editor, pointer movement and hovering (except type tooltips), pane focus and layout resizing, activity in other tabs and apps (only that the page was hidden or lost focus), and writes cut short when the page closes. Practice lists its own in `PRACTICE_CAPTURE_GAPS`, and every `practice.opened` carries them.

## On the device

- **Recorder.** `packages/capture/recorder.ts` assigns positions at once and writes ordered batches asynchronously, so storage never blocks typing. It buffers up to 1,000 records or 4 MiB; failed writes retry with backoff under the same IDs, so partial writes deduplicate, and a changed payload under an existing ID is a conflict, never an overwrite. When the buffer is full the observation is dropped but its position stays used, and a `capture-gap` discloses the range once there is room.
- **Store.** `packages/browser/practice-store.ts` (IndexedDB `muscle-memory-local-practice`, version 5): settings (the participant ID, the device secret, the referral code), `records`, and the `outbox`, which queues every new record in the same transaction that stores it.
- **Compaction.** Once an upload empties the outbox, the store forgets what practice no longer needs (`packages/browser/compaction.ts`): uploaded site records, and practice records and code copies of every attempt but each challenge's latest. The latest attempt stays, for restoring its code and for its result card; anything still queued stays whatever it is. One person's storage therefore grows with the challenges they have touched, not with time.
- **Progress** lives beside it in localStorage, so it survives compaction: per challenge the current attempt, when it started and completed, and how many times it was completed (`muscle-memory.progress`); stars (`muscle-memory.stars`).

## Upload

```text
browser (IndexedDB) ──outbox──▶ ingest Worker ──▶ Pipelines stream ──▶ Iceberg table (Parquet in R2)
                                     │
                                     └──▶ R2 control bucket: participant proofs, deletion tombstones, access requests
```

- **Uploader.** `packages/browser/uploader.ts` sends the oldest records first, every 10 seconds, in gzipped batches of up to 500 records or 1 MB of payload, 10 batches a round at most. When the page is hidden it sends one more small batch with `keepalive`. Only a successful reply removes records from the outbox; any failure keeps them and backs off (10 s, doubling, up to 5 minutes). It runs only while the current Terms are accepted, and only when the app was built with `NEXT_PUBLIC_INGEST_URL` (`/ingest` in production).
- **Ownership.** With the participant ID the device keeps a random secret. Every batch carries its SHA-256 (the proof); the server keeps the first proof it sees for an ID and refuses any other, so nobody can add records under someone else's ID. Deleting needs the secret itself. On plain-HTTP LAN development pages, which have no Web Crypto, a small SHA-256 implementation stands in.
- **Reset and delete.** Settings → reset clears records and the outbox but keeps the identity and secret, so uploaded data stays deletable. Settings → delete asks the server to erase first and stops if the server cannot confirm, so the secret is never forgotten while records are on the server.

## The ingest Worker

`apps/ingest` serves `musclememory.run/ingest/*`: same origin as the app, behind the same Access gate during the owner preview.

- `POST /ingest/v1/batches`: a batch (`packages/domain/ingest.ts`). The whole batch is refused (400) only if its shape is wrong; single records are checked one by one and refused with a reason in a successful reply (another participant, an unknown capture version, a type from the other stream, a payload that does not match its envelope). Only `practice-capture-1.1.0` and `site-capture-1.0.0` are accepted. Release the Worker with the domain package before the app whenever a capture version changes, or the new records are refused.
- **Rate limits** (Workers rate limiting bindings, approximate and per Cloudflare location): 600 requests a minute per address, checked before the body is read, and 120 a minute per participant. Over a limit the reply is 429 with `Retry-After: 60`, and the device keeps its records and backs off.
- `POST /ingest/v1/participants/<id>/delete` with `{ "secret": … }`: writes a tombstone (`deleted/<id>` in the control bucket), after which uploads for that ID get 410 and the uploader stops, and removes the proof (`participants/<id>`), which the tombstone makes useless.
- `POST /ingest/v1/participants/<id>/access` with `{ "secret": … }`: an access request (Settings → access). Notes it as `access/<reference>.json` (`{ participantId, requestedAt }`) and returns the reference, `MM-XXXX-XXXX`, which the person emails us; `{ uploaded: false }` when nothing was ever uploaded under the ID, and 410 after deletion. The operator answers with `tools/erasure/access.py <reference> <file>`, run on their own machine with the erasure job's credentials: every row of that participant, deduplicated and in stream order, as NDJSON.
- Each accepted record becomes one row (`EventRow`): the envelope as columns (`record_id`, `kind`, `participant_id`, `received_at`, `country`, `type`, `capture_version`, `session_id`, `source_id`, `sequence`, `occurred_at`, `elapsed_ms`, `challenge`, `challenge_revision`, `attempt_id`, `terms_version`) and `payload`, the record exactly as the device stored it. The table is the raw archive too: anything can be re-derived from `payload`. `apps/ingest/events.schema.json` is the stream's schema; a test keeps it in step with the rows.
- **Country, never the address.** `country` is where Cloudflare places the upload's connection (`request.cf.country`, ISO 3166-1 alpha-2, null when unknown or over Tor). It is the only thing derived from the connection: the IP address, city and region are never written to a row. It is approximate (VPNs, travel, corporate proxies), so read it alongside the recorded time zone and browser language, and suppress small countries in anything published.

## Setup

Created on the Cloudflare account that hosts the app (`166fd3dff06a9c3f1aef172a25db7ace`, Workers Paid, which Pipelines needs):

- R2 buckets `muscle-memory-control` and `muscle-memory-events`, with R2 Data Catalog on the events bucket (warehouse `166fd3dff06a9c3f1aef172a25db7ace_muscle-memory-events`) and snapshot expiration (older than 7 days, keeping the last 10).
- Stream `muscle_memory_events` (id `e54c4a2140c94890b714985878beab26`, schema `apps/ingest/events.schema.json`, no HTTP endpoint), sink `muscle_memory_events_iceberg` (Iceberg table `default.events`, Parquet with zstd, a file every 5 minutes) and pipeline `muscle_memory_events_pipeline` (`INSERT INTO muscle_memory_events_iceberg SELECT * FROM muscle_memory_events`). A stream's schema is fixed when it is created. After changing the columns: delete the pipeline and stream, drop `default.events` through the catalog's REST API, delete the old table's files, create the stream from the schema file and the pipeline into the existing sink (which keeps its catalog token and creates the table on its first write), update the stream id in `apps/ingest/wrangler.jsonc`, and deploy the Worker. That was last done on 26 October 2026, for the 1.0.0 streams.
- The Worker `muscle-memory-ingest` on the route `musclememory.run/ingest/*`. A route takes precedence over the app's Custom Domain on the same hostname, and Cloudflare Access covers it like the rest of the hostname.
- An R2 API token (Admin Read & Write, which Data Catalog needs) for the sink, kept by the sink.
- The Worker `muscle-memory-erasure` (`apps/erasure`), with no route, its Container `EraseJob`, and the secret `CATALOG_TOKEN`: an R2 API token with Admin Read & Write on `muscle-memory-events` only, used for nothing else. Data Catalog vends the storage credentials, so the container needs no S3 keys. Set it with `npx wrangler secret put CATALOG_TOKEN --config apps/erasure/wrangler.jsonc`.
- The app is built with `NEXT_PUBLIC_INGEST_URL=/ingest` (`apps/web/.env.production`).

CI deploys the ingest Worker with every push to `main`, before the app ([Cloudflare build](cloudflare-build.md)). By hand: `npx wrangler deploy --config apps/ingest/wrangler.jsonc --env=""`. Wrangler needs Node.js 22.

The erasure Worker is deployed by hand, with Docker running, since CI's token has no Containers permission and it rarely changes: `npx wrangler deploy --config apps/erasure/wrangler.jsonc`. CI runs its tests.

## Local development

```sh
npx wrangler dev --config apps/ingest/wrangler.jsonc --env local --port 8787
NEXT_PUBLIC_INGEST_URL=http://localhost:8787/ingest npm run dev --workspace apps/web
```

Without a stream, the Worker writes each batch's rows as NDJSON to `dev-events/<date>/<participant>/` in the local control bucket.

## Analysing

Query the Iceberg table with R2 SQL, or with DuckDB (Iceberg and S3 extensions, R2 credentials). Retried uploads can deliver a record twice, so deduplicate on `record_id`:

```sql
SELECT DISTINCT ON (record_id) * FROM events;
```

An attempt from start to completion, in order:

```sql
SELECT type, occurred_at, payload FROM events
WHERE attempt_id = 'attempt-…'
ORDER BY source_id, sequence;
```

Key events of one practice session:

```sql
SELECT unnest(from_json(json_extract(payload, '$.data.keys'), '["json"]')) AS key
FROM events
WHERE type = 'practice.keys' AND source_id = 'practice-…'
ORDER BY sequence;
```

`session_id` joins a page load's site and practice streams; `participant_id` joins a person's sessions and their profile answers. Each stream's `elapsed_ms` orders its own events exactly; across streams only `occurred_at` lines them up. Typed tables (keys one per row, edits, runs, attempts) come later as transforms of this one.

## Erasure

A deletion request writes a tombstone, `deleted/<participant>`, in the control bucket, and the Worker refuses that participant's uploads from then on. The erasure Worker (`apps/erasure`) runs daily at 03:17 UTC, entirely on Cloudflare, over every tombstone:

- It lists the tombstones through its R2 binding and sends their IDs to its Container (`tools/erasure/server.py`, built from `tools/erasure/Dockerfile`), which deletes the participants' rows from the events table with PyIceberg (`erase.py`), in chunks of 500, retrying when a commit races the pipeline's own appends. Iceberg rewrites the affected Parquet files without those rows.
- The Worker records each erasure that removed rows as `erased/<participant>/<time>.json`, with the count. A failed run records nothing, and the next day's run tries again.
- Its logs (Workers Logs) say how many requests and rows each run handled; a run without `CATALOG_TOKEN` fails at once.
- R2 Data Catalog's snapshot expiration (7 days, keeping the last 10 snapshots) then removes the old files that still held the rows, so erased data is physically gone about a week after the request, inside the 30 days the Privacy Notice promises.

Running over every tombstone each day catches rows the pipeline was still holding when the request came. `tools/erasure/test_erase.py` runs the same Python against a local Iceberg catalog in CI, and `apps/erasure/src/erasure.test.ts` the Worker's part. `wrangler dev --config apps/erasure/wrangler.jsonc --test-scheduled` runs the whole thing locally with Docker (`curl "http://localhost:8787/__scheduled"`), with the secret in `apps/erasure/.dev.vars`.

## Not yet

- Abuse checks beyond validation and rate limits, such as spotting impossible timing in a stream.
- Typed derived tables, and the first interpretations (active time, typing pace) as versioned transforms.
- Experiments: `assignments` is in every envelope, empty until the first one.
