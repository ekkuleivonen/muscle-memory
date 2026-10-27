# Model runs: the same challenges, played by models

Models play every challenge the way a person does, through a headless copy of practice, and everything they do is recorded as raw as a person's practice is: so people's work can be compared with models', and models with each other. Analysis comes later, from the raw data.

**Built so far:** the recorded types (`packages/domain/model.ts`, `actor` in every envelope), headless practice, the model loop, the run ledger, storage, the price snapshot (`packages/model-runs/`, `tools/model-runs/`) and running from the admin (`/admin/benchmarks`). **Not yet:** the lookup condition and showing results.

## Conditions

A model run is held to a person's conditions:

- **Same revision, same knowledge.** The model gets what practice shows on opening: the title, the task, the data schema for SQL, the examples and the starter code. It learns about hidden cases only from Submit's feedback, as a person does. Never the reference solution, rule examples, other attempts or the internet.
- **Same session code.** The harness runs the real practice session (`apps/web/app/practice/session.ts`), editor and runner sandbox in a browser: the operator's tab in the admin, or headless Chromium on a work machine. Edits are real editor transactions; runs and submissions go through the same runner and verdict.
- **Same feedback.** Tool results are the text practice shows: the Output panel (`transcript.ts`) and Submit's feedback (`lib/check-feedback.ts`). Type errors, where a person sees them as squiggles (TypeScript and JavaScript), come back with every edit without being asked for.
- **No nudging.** A reply without a tool call ends the run, as a person leaves. The harness never asks the model to continue.

## Tools

One per thing a person can do, named and described in the harness version.

| Tool | A person | Returns |
| --- | --- | --- |
| `edit_code({ old, new })` | Changing part of the file | The whole file with line numbers (a person always sees the editor) and the type errors shown, or an error and no change if `old` is not found exactly once |
| `write_code({ text })` | Replacing the whole file | The same |
| `run_examples()` | Run examples | The Output panel's text |
| `submit()` | Submit | The Output panel's text and the feedback: the verdict, hidden cases by position and failure category, rules fired |

Several tool calls in one turn run in order, one at a time.

## What is recorded

A run is one session with two source streams on one monotonic clock, so they interleave exactly:

- **`practice-<id>`**, the practice stream ([telemetry](telemetry.md)) with `actor: "model"` and no Terms version: `started` (`from: "model-run"`), `opened`, `edit` (user event `model.edit` or `model.write`), `snapshot`, `assist`, `run`, `submitted`, `completed`, `runtime` and `closed` (`run-ended`). Keys, selection, scrolling, focus, clipboard, page and the after-questions don't apply and are declared gaps (`MODEL_PRACTICE_CAPTURE_GAPS`).
- **`model-<id>`**, the model stream (`model-capture-1.0.0`, `packages/domain/model.ts`): everything that crossed the model boundary.

| Type | Recorded |
| --- | --- |
| `model.run-started` | run id, model asked for, harness version, try, endpoint, the exact system prompt and tool definitions, the request's fixed parameters, the budget, where it ran |
| `model.catalog` | at the start and the end: the model's own entry in OpenRouter's list (prices per token, context, parameters, knowledge cutoff) and its endpoints verbatim (per-provider prices, latency, throughput, uptime). The whole list is the snapshots' job: in the pilot, keeping it per run was 83% of the data |
| `model.request` | each request: turn, attempt, URL, headers but authorization, and its body as an `artifact.blob` stored once under its SHA-256 |
| `model.response-started` | status and every header (the generation id among them) |
| `model.chunks` | every streamed line exactly as received, keep-alive comments and blank lines included, each with its arrival time, about a second at a time |
| `model.response` | what the harness read and acted on: the assembled message (content, `reasoning`, `reasoning_details` verbatim, tool calls), finish reasons, the usage and cost the stream ended with, an error carried in the stream, and when each part was first seen |
| `model.http-error` | a status error with its body, an error mid-stream, a network failure or timeout, and whether the turn is retried |
| `model.generation` | OpenRouter's own record of each generation (`/api/v1/generation`), verbatim: cost, cache discount, latency, generation time, provider, native token counts, every provider tried |
| `model.tool-call` | the call as written, arguments verbatim valid or not, and whether it could be acted on |
| `model.tool-result` | the exact text sent back, how long the tool took, and the practice positions it caused |
| `model.ended` | completed, stopped, budget, refused or error, with the reason |

Prices are kept three ways: what each generation cost (`usage`, `/generation`), the listed prices when each run started and ended (`model.catalog`), and snapshots of every listing.

Runs are never uploaded through ingest, which refuses any `actor` but a person, and never stored in the `events` table that consent and erasure govern.

## Headless practice

`packages/model-runs/practice.ts` (`BrowserPractice`) is practice for a model in any browser page: the admin runs it in the operator's tab, and `tools/model-runs/practice.ts` serves a bundle of it (`tools/model-runs/page.ts`) with the pinned runtimes from `apps/web/public` on a local port, one headless Chromium page per run. It mounts the real `PracticeSession` with its editor, recorder, runner sandbox and, for TypeScript and JavaScript, the type checker, and exposes one call per tool. Edits are dispatched as editor transactions; runs go through `session.run(…, "tool")`. Every record the session stores is kept in memory, by the same rule as the device's store: an identical record is a duplicate, a changed one a conflict. The session takes the run's id as its session id and the run's clock, so its stream lines up with the model stream. It does not focus the editor on mount (a model has no focus), and it waits for squiggles on the starter before the first tool call, as they appear for a person shortly after opening.

`packages/model-runs/render.ts` turns what practice shows into text: the challenge pane and numbered code on opening, the code and type errors after an edit, the Output panel (`transcript.ts`) after a run, and Submit's feedback (`lib/check-feedback.ts`) above it.

`node --import tsx tools/model-runs/practice-check.ts [KEY …]` plays every challenge with a scripted player: the examples, the starter (it must fail), an edit that matches nothing (it must record nothing), the reference solution written and submitted (it must complete). The stream must be a person's in shape with `actor: "model"`: contiguous positions, the same envelope fields, `started` from `model-run`, runs `via: "tool"`, one `completed`, `closed` with `run-ended`, and no keys, selection, scrolling, focus, clipboard or page records. It reads the private reference solutions, so it is a check of the harness, never a run. Build the runtimes first (`node tools/build-runtimes.mjs`).

## The loop

`packages/model-runs/run.ts` runs one model on one revision once (`runModel`): a manual tool-use loop over OpenRouter's streaming chat completions (`packages/model-runs/openrouter.ts`), with the system prompt, tools and `HARNESS_VERSION` in `packages/model-runs/tools.ts`.

- **Requests.** One fixed body per run (`model`, `stream: true`, any fixed parameters such as reasoning, then the messages and tools). The assistant's message goes back as it came, `reasoning_details` merged by index and unchanged, as providers require for tool use.
- **Retries.** A network failure, a timeout, a status of 408, 409, 425, 429 or 5xx, or an error carried in the stream is retried up to three times per turn with backoff, each attempt recorded. After that the run ends as `error`. A model's own failures are results: a reply without a tool call ends the run as `stopped` (or `refused` on a refusal or content filter), and a malformed or unknown tool call is answered with an error and recorded with its arguments verbatim.
- **Budget.** 50 turns and 10 submissions by default; reaching either ends the run as `budget`. A submission that completes ends the run as `completed` without another model call.
- **Accounting after play.** Once the run ends, each generation's record is fetched from `/generation` (again after 1, 2, 4 and 8 seconds while it lags), then the listing is fetched again for `model.catalog` at `end`. Only the model's own entry in the list is kept.
- **Credentials.** The API key goes in the authorization header and is never recorded.
- **Repeated arguments.** Some providers stream a tool call's complete arguments twice, so concatenated deltas read `{…}{…}`. When the arguments are exactly one valid JSON value twice over, the harness acts on one copy and records `repeated: true` on the `model.tool-call`; the lines keep what was sent. Seen with DeepSeek V4.1 Flash on DigitalOcean in the pilot, where it made the model retry a valid call eleven times.
- **Pilot.** `tools/model-runs/pilot.ts` runs listed models on listed challenges once each from a work machine, outside the ledger, writing an outbox and a summary. Logprobs are requested, with `provider.require_parameters`, where a model's listing supports them.

`packages/model-runs/run.test.ts` replays streams split at awkward places (keep-alive comments, lines cut across network reads, tool arguments in pieces, reasoning in pieces, a usage chunk repeating the finish reason, errors before and during the stream, malformed calls). `node --import tsx tools/model-runs/loop-check.ts [KEY …]` runs the whole loop in a real browser with a scripted stream writing the reference solution, and checks that every practice observation a tool call caused falls between that call and its result on the shared clock.

## Storage

- **The ledger** is in the catalog D1 database (`migrations/catalog/0002_model_runs.sql`, `packages/model-runs/ledger.ts`). `model_roster` lists the models to run; `model_runs` has one row per slot: revision, model, harness version, condition (experiment arms as canonical JSON) and try. Backfilling queues every slot the roster and the published revisions call for and leaves existing slots alone, so a new model, a new revision, a new harness version or a new condition is just new rows. A worker claims the oldest queued slot under a fresh run id. A finished row is a result: a trigger refuses any change to it. A harness failure (the sandbox, the network, the machine) marks the slot to run again under a new run id, up to three attempts, and then it waits for a person.
- **The events** go to their own Iceberg table, `default.model_events`, in the events bucket's R2 Data Catalog, with exactly the events table's columns (`packages/model-runs/rows.ts`): `received_at` is when the harness stored the run, and `country` is null. The harness writes one NDJSON file per run to an outbox, refusing anything that is not a model's; `tools/model-runs/store_events.py runs <outbox>` appends each file in one commit and moves it to `stored/`. A file already appended (its first record is in the table) is moved without appending again. Like the events table, read it deduplicated on `record_id`.

## Running from the admin

`/admin/benchmarks` (`apps/web/app/admin/benchmarks/benchmarks.tsx`) runs models from the operator's tab, behind the admin's Access check like every admin page.

- **A to-do list.** The admin keeps a list of models (`model_list`). Each model's card shows every reasoning level its OpenRouter listing offers, the model's own default tagged `default`, each with a switch; the levels switched on are the roster (`model_roster`, targets). A new model runs its default level only. Every level switched on is run on every live challenge revision with the current harness, three tries each (`TRIES`), never more. Cards are collapsed to one line (levels on, coverage, runs left, cost and time to finish, spent); open, each level shows challenges with every try finished, runs finished and completed, waiting, to do, spent and its cost to finish, with earlier harness versions dimmed beneath. Switching a level off drops its waiting runs at once; its finished runs stay and still show. Taking a model off the list does the same for all its levels. Workers only ever claim runs whose level is switched on, so nothing left in the queue from an earlier roster runs.
- **Cost and time.** A run's cost is what its responses reported (`usage.cost`), summed on the server from the records handed in (`runCost`) and kept in the ledger, with the time from claim to hand-in. Cost and time to finish come from each level's own averages, or its model's other levels' until it has runs of its own (said as "from other levels"); a model that has never run is not estimated. Time to finish divides by the runs at a time chosen.
- **Go is idempotent.** It first makes the queue exactly what the roster still needs (`sync` in `packages/model-runs/ledger.ts`, `/admin/api/model-runs/sync`): missing slots are queued; slots still waiting that are no longer needed (a target removed, a revision no longer live) are dropped; slots that ran or are running are never touched. Then it works through the queue, first tries first, so coverage grows evenly across challenges. Pressing it again, or from another tab, never repeats a finished run. A challenge's new revision is new work; so is a new harness version, whose earlier results stay on the card as earlier.
- **Running.** Paste an OpenRouter key and choose how many runs at a time (1 to 4). Each worker claims a slot under a fresh run id (`/claim`, which returns only the public revision), plays it in this page with `BrowserPractice` and the loop, and hands in its records (`/<runId>`). The request asks for the condition's effort and for logprobs where the model's listing supports them (`packages/model-runs/admin.ts`). The key lives only in the component's memory and goes only to OpenRouter; it is never stored or recorded.
- **Hidden tab.** Browsers slow timers in hidden tabs to once a minute, which would distort what is recorded, so workers wait while the tab is hidden and claim nothing new.
- **Handing in.** The server checks every record against the slot (the model's participant, this run's session, this revision, `actor: "model"`, no Terms, unique ids), writes the rows once to `model-runs/outbox/<runId>.ndjson` in the private content bucket, then finishes the slot. A harness failure marks the slot to run again. A run still marked running two hours after it started (a closed tab) is claimed again under a new id, and the old id can no longer hand in.
- **Storing.** `.github/workflows/model-runs-store.yml` (on demand) appends the bucket's outbox to `default.model_events` and moves each object to `model-runs/stored/`.

`MODEL_RUNS_FIXTURE=1 node tools/browser/admin-check.mjs` (after `npm run build:cloudflare`) does one run through the built Worker in Chromium, with OpenRouter answered by a scripted model writing the reference solution: adding a model, Go, one run handed in, the coverage shown, a second sync that changes nothing, the rows in R2, the ledger, and that the key is in no stored row.

## Price history

`.github/workflows/model-catalog.yml` runs `tools/model-runs/snapshot.ts` on demand (daily once the owner says so): OpenRouter's whole model list (no key needed) and the endpoints of every model on the roster, each HTTP exchange verbatim, one row per request in `default.model_catalog` (`tools/model-runs/catalog.schema.json`). With the `MODEL_RUNS_D1_TOKEN` secret the roster is read from D1; without it, the snapshot is the list alone. With `OPENROUTER_API_KEY`, endpoint latency and throughput figures are included; OpenRouter gives them only to a signed-in caller. The first run creates the table.

## Decided (27 October 2026)

- **Reasoning effort is a condition**, like any other experiment arm: every model eventually runs at every effort it supports (`supported_efforts` in its listing), each a series of its own in the ledger. A model's default is one of them.
- **Log probabilities** are requested wherever a model's listing supports them (`logprobs`, `top_logprobs`), and kept in the raw stream.
- **Three tries** per revision, model and condition; **50 turns and 10 submissions** per run.
- **Spending** is capped on the OpenRouter key itself, not in the harness.
- **Roster:** Claude Opus 5.5, GPT-6.1 Terra, DeepSeek V4.1 Flash (1017) and Gemini 3.8 Flash.
- **Runs happen in the admin**, from the operator's browser with a temporary key.

## Not yet

- **Secrets for the snapshot:** `MODEL_RUNS_D1_TOKEN` (its roster) and `OPENROUTER_API_KEY` (endpoint statistics).
- **Publishing** still records `blocked_configuration`. Nothing more is needed to cover a new revision: the next Go queues it.
- **The lookup condition:** a `search_web` tool as a separate condition, once hidden cases and solutions have left the repository.
- **Showing results** to people after they complete, from a daily aggregate of the runs.
