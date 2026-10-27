# Model runs: the same challenges, played by models

Models play every challenge the way a person does, through a headless copy of practice, and everything they do is recorded as raw as a person's practice is: so people's work can be compared with models', and models with each other. Analysis comes later, from the raw data.

**Built so far:** the recorded types (`packages/domain/model.ts`, `actor` in every envelope). **Not yet:** the headless session, the model loop, storage, the price snapshots, publishing and showing results.

## Conditions

A model run is held to a person's conditions:

- **Same revision, same knowledge.** The model gets what practice shows on opening: the title, the task, the data schema for SQL, the examples and the starter code. It learns about hidden cases only from Submit's feedback, as a person does. Never the reference solution, rule examples, other attempts or the internet.
- **Same session code.** The harness runs the real practice session (`apps/web/app/practice/session.ts`), editor and runner sandbox in headless Chromium. Edits are real editor transactions; runs and submissions go through the same runner and verdict.
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
| `model.catalog` | at the start and the end: the model's OpenRouter listing (prices per token, context, parameters, knowledge cutoff) and its endpoints (per-provider prices, latency, throughput, uptime), each the HTTP exchange verbatim |
| `model.request` | each request: turn, attempt, URL, headers but authorization, and its body as an `artifact.blob` stored once under its SHA-256 |
| `model.response-started` | status and every header (the generation id among them) |
| `model.chunks` | every streamed line exactly as received, keep-alive comments and blank lines included, each with its arrival time, about a second at a time |
| `model.response` | what the harness read and acted on: the assembled message (content, `reasoning`, `reasoning_details` verbatim, tool calls), finish reasons, the usage and cost the stream ended with, an error carried in the stream, and when each part was first seen |
| `model.http-error` | a status error with its body, an error mid-stream, a network failure or timeout, and whether the turn is retried |
| `model.generation` | OpenRouter's own record of each generation (`/api/v1/generation`), verbatim: cost, cache discount, latency, generation time, provider, native token counts, every provider tried |
| `model.tool-call` | the call as written, arguments verbatim valid or not, and whether it could be acted on |
| `model.tool-result` | the exact text sent back, how long the tool took, and the practice positions it caused |
| `model.ended` | completed, stopped, budget, refused or error, with the reason |

Prices are kept three ways: what each generation cost (`usage`, `/generation`), the listed prices when each run started and ended (`model.catalog`), and a daily snapshot of every listing.

Runs are never uploaded through ingest, which refuses any `actor` but a person, and never stored in the `events` table that consent and erasure govern.
