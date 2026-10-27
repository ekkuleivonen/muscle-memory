# Model runs: the same challenges, played by models

Models play every challenge the way a person does, through a headless copy of practice, and everything they do is recorded as raw as a person's practice is: so people's work can be compared with models', and models with each other. Analysis comes later, from the raw data.

**Built so far:** the recorded types (`packages/domain/model.ts`, `actor` in every envelope) headless practice and the model loop (`tools/model-runs/`). **Not yet:** storage, the price snapshots, publishing and showing results.

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

## Headless practice

`tools/model-runs/practice.ts` serves a bundle of `tools/model-runs/page.ts` and the pinned runtimes from `apps/web/public` on a local port, and opens one headless Chromium page per run. The page mounts the real `PracticeSession` with its editor, recorder, runner sandbox and, for TypeScript and JavaScript, the type checker, and exposes one call per tool. Edits are dispatched as editor transactions; runs go through `session.run(…, "tool")`. Every record the session stores comes back to Node through an exposed function and is kept in memory, by the same rule as the device's store: an identical record is a duplicate, a changed one a conflict. The session takes the run's id as its session id and the run's clock, so its stream lines up with the model stream. It does not focus the editor on mount (a model has no focus), and it waits for squiggles on the starter before the first tool call, as they appear for a person shortly after opening.

`tools/model-runs/render.ts` turns what practice shows into text: the challenge pane and numbered code on opening, the code and type errors after an edit, the Output panel (`transcript.ts`) after a run, and Submit's feedback (`lib/check-feedback.ts`) above it.

`node --import tsx tools/model-runs/practice-check.ts [KEY …]` plays every challenge with a scripted player: the examples, the starter (it must fail), an edit that matches nothing (it must record nothing), the reference solution written and submitted (it must complete). The stream must be a person's in shape with `actor: "model"`: contiguous positions, the same envelope fields, `started` from `model-run`, runs `via: "tool"`, one `completed`, `closed` with `run-ended`, and no keys, selection, scrolling, focus, clipboard or page records. It reads the private reference solutions, so it is a check of the harness, never a run. Build the runtimes first (`node tools/build-runtimes.mjs`).

## The loop

`tools/model-runs/run.ts` runs one model on one revision once (`runModel`): a manual tool-use loop over OpenRouter's streaming chat completions (`tools/model-runs/openrouter.ts`), with the system prompt, tools and `HARNESS_VERSION` in `tools/model-runs/tools.ts`.

- **Requests.** One fixed body per run (`model`, `stream: true`, any fixed parameters such as reasoning, then the messages and tools). The assistant's message goes back as it came, `reasoning_details` merged by index and unchanged, as providers require for tool use.
- **Retries.** A network failure, a timeout, a status of 408, 409, 425, 429 or 5xx, or an error carried in the stream is retried up to three times per turn with backoff, each attempt recorded. After that the run ends as `error`. A model's own failures are results: a reply without a tool call ends the run as `stopped` (or `refused` on a refusal or content filter), and a malformed or unknown tool call is answered with an error and recorded with its arguments verbatim.
- **Budget.** 50 turns and 10 submissions by default; reaching either ends the run as `budget`. A submission that completes ends the run as `completed` without another model call.
- **Accounting after play.** Once the run ends, each generation's record is fetched from `/generation` (again after 1, 2, 4 and 8 seconds while it lags), then the listing is fetched again for `model.catalog` at `end`. The full model list is stored once as a blob.
- **Credentials.** The API key goes in the authorization header and is never recorded.

`tools/model-runs/run.test.ts` replays streams split at awkward places (keep-alive comments, lines cut across network reads, tool arguments in pieces, reasoning in pieces, a usage chunk repeating the finish reason, errors before and during the stream, malformed calls). `node --import tsx tools/model-runs/loop-check.ts [KEY …]` runs the whole loop in a real browser with a scripted stream writing the reference solution, and checks that every practice observation a tool call caused falls between that call and its result on the shared clock.
