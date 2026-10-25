# Model runs: the same challenges, done by models

**Status: plan, nothing built.** How coding models would work each challenge the way a person does, once when a revision is published, so people can see how their unaided work compares with a model's.

## What "the same" means

A model run is held to the person's conditions, not to a benchmark's:

- **Same revision.** A run names the challenge's revision hash, like every human record. A new revision is a new run.
- **Same knowledge.** The model sees exactly what practice shows: the task, the editable file's starting code, the examples, and for SQL the schema. It learns about hidden cases only from a Submit's feedback, as a person does (by position and failure category), and never sees the reference solution, rule examples, other people's attempts or the internet. No web search, no code execution outside the sandbox, no other tools.
- **Same checks.** Feedback comes from the same deterministic code: Run examples shows every example in full; Submit runs every case and the rules (`apps/web/lib/submission.ts`) and reports them as practice does (`apps/web/lib/check-feedback.ts`, `apps/web/lib/diagnosis.ts`).
- **Same help.** The editor's help for people is listed in `editorFeatures` (highlighting, type errors, hover types). The model gets the same, as a `diagnostics` tool that returns what the type checker would show. No completion, because people have none.
- **Same machine.** Code runs in the browser sandbox (`packages/runner`) in headless Chromium, the way `npm run check:publish` already runs reference solutions: same runtimes, same limits, same errors.

## The harness

A headless practice session that owns the state the practice page owns, driven through tools. It runs offline (a CI job or a work machine), never in the app, and nothing it produces reaches a person while they practise (see the AI rule in the root `AGENTS.md`).

**Tools**, one per thing a person can do. Names and shapes are part of the harness version.

| Tool | Person's equivalent | Returns |
| --- | --- | --- |
| `read_challenge` | The challenge pane | The task, examples and schema |
| `read_code` / `edit_code` | The editor (the editable file only) | The file's text; the new text |
| `diagnostics` | Squiggles and hover types, where the language has them | The type checker's messages |
| `run_examples` | Run examples | Each example's input, expected, got, output |
| `submit` | Submit | The verdict: cases passed, hidden ones by position and category, rules fired; complete or not |

**The loop.** A manual tool-use loop rather than a hosted agent: the harness must enforce the edit-only rule and stop at the budget. With the Anthropic SDK that is `client.messages.stream(...)` in a loop, executing every `tool_use` block and returning all `tool_result` blocks in one user message. Notes from the current API, which shape the design:

- Current models (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`) reject `temperature` and forced `tool_choice`, and think on every turn. Runs are not reproducible from a seed, so each model works each revision several times (5 to start) and results are reported as a spread, never as one number.
- Effort (`output_config.effort`) is part of the run's configuration and recorded; it changes results more than most settings.
- Tools use `strict: true` so inputs validate; a refusal or a `max_tokens` stop ends the run with that reason recorded.
- The system prompt is one fixed text for every model: here is a challenge, solve it in the editable file. It is versioned with the harness and never tuned per model or per challenge.
- Other providers plug in behind the same tool definitions through their own SDKs; the harness, not the model API, defines the run.

**Budget.** A run ends when it completes, gives up, or reaches a step limit and a token budget set per difficulty, recorded either way.

## What is recorded

Runs are kept apart from people's data so no human dataset or comparison ever mixes them in: their own table (`model_runs`, and `model_events` for the step log) in the same Iceberg catalog, never the `events` table that consent and erasure govern.

- **Per run:** challenge key, revision hash, model ID, provider, effort, harness version, prompt version, start and end, outcome (completed, gave up, budget, refusal), tokens in and out, cost.
- **Per step:** the tool called, its input and its result as the model saw it. Edits are stored as the full text after each edit, like practice snapshots, so a run's code can be replayed and diffed.
- **The same facts as a person's attempt** where they mean the same thing: example runs, submissions, the first submission's result and which submission completed. Keystrokes and typing don't apply.

## When it runs

At publish: when a revision is published (today `npm run build:content`; later the admin publish action), the publish job queues runs for that revision hash for every model on the current list. Each (revision, model, harness version) runs once and is immutable, like a revision. A new model on the list is backfilled over published revisions; a new harness version runs as a separate series.

Order matters for contamination: run the models before the revision's code, tests or solutions are public anywhere, and record the publish date next to each model's training cutoff. Reference solutions stay private regardless.

## What people see

Only after completing, and only as numbers: "Claude Opus 5.5 completed this in 3 of 5 tries, on its second submission at best". Never a model's code, and never anything before the person has completed, which would be AI help at runtime. Stealth players, who see no one else's stats, see no model stats either.

## Building it, in order

1. **Headless practice** (`tools/model-runs/`): load a revision from the catalog, keep the editable file, and run examples and submissions through the browser sandbox via Playwright (reusing `tools/browser/content-check.ts`) with the same verdict and feedback code. Test it by driving the reference solution through it: it must complete on its first submission.
2. **Tool definitions and the loop**, with one model, on three challenges of different difficulty and language. Read every transcript before trusting any number.
3. **Storage**: the two tables, written through the ingest pipeline's sink or a direct writer, and a run report.
4. **Publish hook and backfill.**
5. **Showing it** after completion, from a daily aggregate of the runs.

## Open questions

- How many tries per model, and the cost ceiling per publish.
- Which models besides Anthropic's, and whether to run them through each provider's own SDK.
- Whether a run may give up explicitly (a `give_up` tool) or only by stopping.
