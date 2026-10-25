# Model runs: the same issues, done by models

**Status: plan, nothing built.** How coding models would work each issue the way a person does, once when a revision is published, so people can see how their unaided work compares with a model's.

## What "the same" means

A model run is held to the player's conditions, not to a benchmark's:

- **Same revision.** A run names the issue's revision hash, like every human record. A new revision is a new run.
- **Same knowledge.** The model sees exactly what the IDE shows: the ticket body, the repo's files with their roles (edit, read, tests, docs), the visible test cases, the ticket's thread. It sees cases the test file leaves out only when CI reports them, as a person does, and never sees the reference solution, trigger examples, other people's attempts or the internet. No web search, no code execution outside the sandbox, no other tools.
- **Same experience.** Feedback arrives the way it does for people, from the same deterministic code: teammate comments and hints are released by the same triggers (`packages/content/triggers.ts`, `apps/web/lib/feedback.ts`), CI on a pull request runs every case and reports each one as the Checks tab does (a test-file case with its input, expected value and result, a hidden case by name and failure category), blocking review threads hold the merge until a later push stops triggering them or the model replies.
- **Same help.** The editor's help for people is listed in `editorFeatures` (highlighting, type errors, hover types). The model gets the same, as a `diagnostics` tool that returns what the type checker would show for the open file. No completion, because players have none.
- **Same machine.** Code runs in the browser sandbox (`packages/runner`) in headless Chromium, the way `npm run check:publish` already runs reference solutions: same runtimes, same limits, same errors.

## The harness

A headless "workspace" that owns the state a player's IDE owns, driven through tools. It runs offline (a CI job or a work machine), never in the app, and nothing it produces reaches a player while they play (see the AI policy in the root `AGENTS.md`).

**Tools**, one per thing a player can do. Names and shapes are part of the harness version.

| Tool | Player equivalent | Returns |
| --- | --- | --- |
| `read_ticket` | The issue page and the IDE's Ticket panel | Ticket markdown and the thread so far |
| `list_files` / `open_file` | Explorer, tabs | Paths with roles; a file's text |
| `edit_file` | Typing in the editor (edit-role files only) | The new text, or an error for a read-only file |
| `diagnostics` | Squiggles and hover types, where the language has them | The type checker's messages |
| `run_tests` | Run tests (visible cases only) | The Tests panel: each case's input, expected, got, output |
| `open_pull_request` / `push` | Open pull request, push to it | CI result per case; review comments released by the push |
| `reply` | Replying to a review thread | The thread, resolved or not |
| `merge` | Merge (blocked while checks fail or a blocking thread is open) | Merged, or why not |

**The clock.** Behaviour triggers count active minutes and runs without progress. A model has no wall clock that means the same thing, so the harness keeps a simulated one: each tool call advances it by a fixed, documented cost (for example reading a file 30 s, an edit 20 s, a test run 15 s). Hints and "taking a while?" comments then fire at the same points in the work they would for a person. The costs are harness parameters, recorded with every run.

**The loop.** A manual tool-use loop rather than a hosted agent: the harness must own the clock, release feedback between turns, enforce the edit-only rule and stop at the budget. With the Anthropic SDK that is `client.messages.stream(...)` in a loop, executing every `tool_use` block and returning all `tool_result` blocks in one user message. Notes from the current API, which shape the design:

- Current models (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`) reject `temperature` and forced `tool_choice`, and think on every turn. Runs are not reproducible from a seed, so each model works each revision several times (5 to start) and results are reported as a spread, never as one number.
- Effort (`output_config.effort`) is part of the run's configuration and recorded; it changes results more than most settings.
- Tools use `strict: true` so inputs validate; a refusal or a `max_tokens` stop ends the run with that reason recorded.
- The system prompt is one fixed text for every model: you are a developer at Muscle Memory Inc., here is your ticket and your repo, do it like you would at work. It is versioned with the harness and never tuned per model or per issue.
- Other providers plug in behind the same tool definitions through their own SDKs; the harness, not the model API, defines the run.

**Budget.** A run ends when it merges, gives up, or reaches a step limit and a token budget set per difficulty, recorded either way. People can abandon an issue; models can too.

## What is recorded

Runs are kept apart from people's data so no human dataset or comparison ever mixes them in: their own table (`model_runs`, and `model_events` for the step log) in the same Iceberg catalog, never the `events` table that consent and erasure govern.

- **Per run:** issue key, revision hash, model ID, provider, effort, harness version, prompt version, clock costs, start and end, outcome (merged, gave up, budget, refusal), tokens in and out, cost.
- **Per step:** the tool called, its input, its result as the model saw it, simulated time, and feedback released. Edits are stored as the full text after each edit, like workspace snapshots, so a run's code can be replayed and diffed like a pull request.
- **The same numbers as the result card** where they mean the same thing: runs, green on run N, pushes, hints released, blocking comments triggered, simulated active time. Keystrokes, typos and typing speed don't apply and stay empty.

## When it runs

At publish: when a revision is published (today `npm run build:content`; later the admin publish action), the publish job queues runs for that revision hash for every model on the current list. Each (revision, model, harness version) runs once and is immutable, like a revision. A new model on the list is backfilled over published revisions; a new harness version runs as a separate series.

Order matters for contamination: run the models before the revision's code, tests or solutions are public anywhere, and record the publish date next to each model's training cutoff. Reference solutions stay private regardless.

## What people see

Only after merging, alongside the human comparison, and only as numbers: "Claude Opus 5.5 merged this in 3 of 5 tries, green on run 2 at best", "people in Python: faster than 72%". Never a model's code, and never anything before the person has finished, which would be AI help at runtime. Stealth players, who see no one else's stats, see no model stats either.

## Building it, in order

1. **Headless workspace** (`tools/model-runs/`): load a revision from the catalog, keep files and the clock, run cases through the browser sandbox via Playwright (reusing `tools/browser/content-check.ts`), and release feedback with the existing trigger code. Test it by driving the reference solution through it: it must merge with no hints.
2. **Tool definitions and the loop**, with one model, on three issues of different difficulty and language. Read every transcript before trusting any number.
3. **Storage**: the two tables, written through the ingest pipeline's sink or a direct writer, and a run report.
4. **Publish hook and backfill.**
5. **Comparison** in the merged pull request's Details, next to the human one, from a daily aggregate like `tools/aggregates`.

## Open questions

- Clock costs: fixed per tool, or proportional to tokens read and written? Fixed is simpler and easier to explain.
- How many tries per model, and the cost ceiling per publish.
- Which models besides Anthropic's, and whether to run them through each provider's own SDK.
- Whether a run may give up explicitly (a `give_up` tool) or only by stopping.
