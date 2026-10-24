# Agents

Muscle Memory is practice that feels like a developer job before AI, and it records granular, raw practice data. Start with the README, then `docs/` (`issue-model.md` for issues and content, `workspace.md` for the IDE and runners, `telemetry.md` for uploads, `play.md` for the five-minute test and sharing). App-specific notes: `apps/web/AGENTS.md`.

## Rules that are easy to break

- **No AI at runtime.** Nothing a model generates while someone plays reaches them: no completion, chat, suggestions, code generation or live review, and no player data goes to a model. Classic tooling (syntax highlighting, type errors, hover types) is fine and must be listed in `editorFeatures` so recorded data says what help was on. Autocomplete is undecided: ask first. AI may draft issues, teammate comments and hints offline; a person reviews them before publishing, and they fire at runtime only through deterministic triggers.
- **CI is deterministic.** Checks are rule-driven (cases, static rules) and decide merging.
- **Revisions are immutable.** An issue's revision is stored under the hash of its content and never edited; changing it adds a revision (see CONTRIBUTING and `docs/issue-model.md`). Content is seed data: edit `content/seed.ts`, run `npm run build:content`, and never edit `content/catalog.json` by hand.
- **Recorded data keeps its meaning.** If what an observation records changes, bump the capture version in `packages/domain` and say what changed in its comment.
- **Code runs only in the browser sandbox** (`packages/runner`): an opaque-origin iframe with a CSP that denies every connection, plus a worker. Never relax the CSP, run user code in the page, or fetch runtime files from anywhere but this origin. The one documented exception: the Java engine's frame allows `eval`, which TeaVM's loader needs (`allowEval`, see `docs/workspace.md`).

## Runtimes

- One engine per language in `packages/runner/engines.ts`; each has a worker in `workers/` that defines `boot(assets, config)` and `execute(request)` on top of the shared prelude and returns the common result shape (phase, error, cases with JSON output).
- Every runtime file is pinned by hash and size in `runtime-manifest.json`. `tools/build-runtimes.mjs` builds and verifies them; after changing a runtime, run it with `--update` and commit the manifest. Builds must be reproducible: the Go and C# runners are built from `tools/runtimes/`, and Java from a pinned teavm-javac commit, in digest-pinned Docker images, and files over 25 MiB are gzipped with fflate (not `node:zlib`, whose output differs between Node versions).
- Cases are JSON. Without `parameters`, a case is the function's only argument; with them, it is the argument list. SQL issues carry a `schema`; C, C++ and Java issues carry an `adapter` from JSON arguments to the function's types.
- `node tools/browser/sandbox-check.mjs chromium` checks every engine's results, errors and isolation in a real browser. Run it after touching the runner or a worker.
- `npm run check:publish` runs each seed issue's private reference solution and its starter in the same sandbox. Run it after changing an issue's code or cases.

## Working here

- Small commits with a message that says why. Keep docs in step with behavior in the same change.
