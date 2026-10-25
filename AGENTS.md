# Agents

Muscle Memory is independent coding practice: challenge, code, immediate feedback, then the next challenge. It records granular, raw practice data. Clarity is mandatory; realistic framing is optional and must help explain the problem. Difficulty comes from solving the problem, not decoding the prompt. Start with the README, then `docs/` (`challenges.md` for challenges and content, `workspace.md` for practice and the runners, `telemetry.md` for what is recorded and how it is uploaded, `start.md` for the ways in and sharing, `profile.md` for the profile questions and settings, `model-runs.md` for the planned model runs). App-specific notes: `apps/web/AGENTS.md`.

## Before launch

Nobody uses Muscle Memory yet. Until launch, the rules on revisions and recorded data below describe the design, not a duty to stay compatible: schemas, capture versions, stored formats, catalog revisions and links can be reset freely, with no migrations, legacy readers or redirects. Keep the current version simple and correct instead. The other rules (no AI at runtime, deterministic checks, the sandbox) hold now.

## Rules that are easy to break

- **No AI at runtime.** Nothing a model generates while someone plays reaches them: no completion, chat, suggestions, code generation or live review, and no player data goes to a model. Classic tooling (syntax highlighting, type errors, hover types) is fine and must be listed in `editorFeatures` so recorded data says what help was on. Autocomplete is undecided: ask first. AI may draft challenges and their rules offline; a person reviews them before publishing, and rules fire at runtime only deterministically.
- **Checks are deterministic.** A submission is judged by its cases and static rules, and nothing else.
- **Revisions are immutable.** A challenge's revision is stored under the hash of its content and never edited; changing it adds a revision (see CONTRIBUTING and `docs/challenges.md`). Challenges are folders of files in `content/challenges/<KEY>/`; `npm run build:content` builds them into `content/catalog.json`, a build output that is never committed or edited.
- **Recorded data keeps its meaning.** If what an observation records changes, bump the capture version in `packages/domain` and say what changed in its comment.
- **Code runs only in the browser sandbox** (`packages/runner`): an opaque-origin iframe with a CSP that denies every connection, plus a worker. Never relax the CSP, run user code in the page, or fetch runtime files from anywhere but this origin. The one documented exception: the Java engine's frame allows `eval`, which TeaVM's loader needs (`allowEval`, see `docs/workspace.md`).

## Runtimes

- One engine per language in `packages/runner/engines.ts`; each has a worker in `workers/` that defines `boot(assets, config)` and `execute(request)` on top of the shared prelude and returns the common result shape (phase, error, cases with JSON output).
- Every runtime file is pinned by hash and size in `runtime-manifest.json`. `tools/build-runtimes.mjs` builds and verifies them; after changing a runtime, run it with `--update` and commit the manifest. Builds must be reproducible: the Go and C# runners are built from `tools/runtimes/`, and Java from a pinned teavm-javac commit, in digest-pinned Docker images, and files over 25 MiB are gzipped with fflate (not `node:zlib`, whose output differs between Node versions).
- Cases are JSON. Without `parameters`, a case is the function's only argument; with them, it is the argument list. SQL challenges carry a `schema`; C, C++ and Java challenges carry an `adapter` from JSON arguments to the function's types.
- `node tools/browser/sandbox-check.mjs chromium` checks every engine's results, errors and isolation in a real browser. Run it after touching the runner or a worker.
- `npm run check:publish` runs each challenge's private solutions and its starter in the same sandbox. Run it after changing a challenge's code or cases.

## Working here

- Small commits with a message that says why. Keep docs in step with behavior in the same change.
