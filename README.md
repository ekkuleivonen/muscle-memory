# Muscle Memory

Friendly coding Adventures to test, practice and maintain the craft of writing code. AI is part of everyday development; Muscle Memory makes room to enjoy writing code yourself in your free time, with private feedback and room to improve.

Created by [Ekku Leivonen](https://github.com/ekkuleivonen), inspired by a developer’s observation of fading coding fluency while using AI more often. That observation is a starting question, not evidence of causation. Open source and initially free; early Foundation work. Only an owner-only preview is hosted, behind Cloudflare Access; there is no public service yet.

With voluntary research participation, we also hope to study how developer skills evolve over time and compare with coding models through aggregate results. Individual results stay private. Research collection and model benchmarking are later work; the current demo uses synthetic data only.

An **Adventure** contains **Challenges**. Challenge **Attempts** produce versioned **Assessments**. Stories, order and clues matter, so encounter context stays attached to every Attempt.

## Run the Foundation reference

The product app uses Next.js and TypeScript. With Node.js 22+:

```sh
npm ci
npm run dev
```

`npm run dev` uses webpack, like production builds: Turbopack turns imported JSON into object literals, where the reference fixture key `__proto__` is silently dropped. The server also re-checks every catalog digest on load, so altered content fails loudly.

Open http://localhost:3000. First visits go to `/onboarding`, a one-time terminal-style setup that starts with accepting the [Terms and Privacy Notice](docs/legal.md) (`/terms`, `/privacy`) and whose answers stay in the browser; a cookie holding only the setup version lets pages skip it afterwards, and signed-in visits to `/onboarding` go straight on. Setup ends on the home dashboard, or on the page that redirected there. Browse `/issues` and `/projects` (Challenges and Adventures, presented as issues and projects; an issue lives at its permanent key, e.g. `/issues/FN-1`, and a project at its unique key, e.g. `/projects/FN`; older slug links redirect there) with search and filters in the URL. Setting an issue's status to Todo or In progress (Status menu, `s`) puts it on your board at `/board`, and `is:todo` (or `is:backlog`, `is:in-progress`, `is:done`) finds issues by board status; Done is never set by hand: in the IDE you run the tests as often as you like, then open a pull request; when its checks all pass it merges and the issue moves to Done. The board lives in this browser only, and each status change is recorded there as [board activity](docs/board-activity.md). The profile menu at the bottom of the sidebar shows your anonymous handle (handed out at random, Reddit-style; mocked in the browser until accounts exist) and leads to `/settings`, the same terminal as onboarding with settings as commands: `profile` (the setup answers), `privacy` (going stealth: out of published stats and comparisons, and no one else's stats in return), `logout`, `reset` (progress) and `delete` (the account and everything this browser holds). Log out ends the cookie session and keeps local data; the terminal then offers to sign back in. No practice records are uploaded. **Start work** opens the issue in [the IDE](docs/workspace.md) at `/work/<KEY>`: a VS Code-style editor on a small generated repo (your file, the acceptance tests in that language's style, the project README), with Vim keybindings if you chose them. Python, JavaScript, TypeScript, SQL (real Postgres, via PGlite), HTML, PHP, Ruby, Go, C and C++ run only inside a network-denied browser sandbox, never on a server; other languages are editable until they have a runner.

```sh
npm test
npm run build
npm run build:cloudflare
```

See [Cloudflare build notes](docs/cloudflare-build.md). No account or deployment is required for local builds.

The earlier contract spike uses Python 3.11+ with no dependencies.

Run the contract spike:

```sh
PYTHONPATH=packages/core python3 -m unittest discover -s packages/core/tests -v
PYTHONPATH=packages/core python3 apps/reference/demo.py
```

The demo uses synthetic JSON answers. It validates the content → encounter → attempt → assessment path, preserving both content versions and the Challenge digest. It does not execute submitted code, store real participant data, or infer general ability. Scoring is a provisional fraction of fixture outputs correct; there is no leaderboard or calibrated ranking.

## Monorepo

- `apps/web`: Next.js reference Adventure and local feedback.
- `packages/domain`: pure TypeScript assessment/event contracts and tests.
- `packages/catalog`: versioned authoring lifecycle and application eligibility gates.
- `packages/browser`: optional private device-local history.
- `packages/storage`: local transactional event store and retryable archive adapter.
- `packages/runner`: sandboxed in-browser runtimes, one engine per language (Pyodide, the browser's JavaScript engine with Sucrase, PGlite, linkedom, php-wasm, ruby.wasm, Yaegi for Go, Clang for C and C++) behind one opaque-origin, network-denied iframe.
- `packages/capture`: bounded, ordered capture of workspace observations with retry and gap disclosure.
- `packages/core/muscle_memory`: portable immutable contracts and pure assessment logic.
- `content/adventures`: story, presentation and pinned Challenge sequence.
- `content/challenges`: tasks, fixtures, hints, skills and assessment versions.
- `apps/reference`: executable synthetic acceptance flow.
- `docs/foundation.md`: boundaries, acceptance gates and next implementation slices.

The first audience is working developers practicing basic iteration and map handling. The initial contract spike is Python; the product app uses Next.js and TypeScript; structured answers keep the domain independent of a future runner or web framework. A Challenge is not tied to an escape room: field notes, mysteries, riddles and workouts can use the same model.

See [contributing](CONTRIBUTING.md) and [security](SECURITY.md). Licensed under MIT.

The [durable reference demo](docs/local-events.md) uses synthetic data to prove persisted, deduplicated events and retryable private JSON export: run `npm run demo:events` twice. `npm run demo:evidence` shows the capture-first contract: original submissions, including malformed ones, are stored before a separate, versioned assessment projection. The browser app keeps results in session memory unless device-local history is explicitly enabled.

See the [authoring lifecycle](docs/authoring.md) for draft, preview, test, publish, retire and disable commands. The reference app reads a generated published catalog and refreshes its eligibility before starts and assessments.

To design against more than the reference content, build or run the app with `DEMO_CATALOG=1`. Issue and project pages then include a synthetic demo catalog (`content/demo/catalog.json`, built by `npm run build:demo-catalog`) of four projects, one per engineering area (frontend, backend, data, systems), across all highlighted languages. Builds without the flag leave it out entirely. To open the dev server from another device, add `ALLOWED_DEV_ORIGINS=<lan-ip>` and pass `-- -H 0.0.0.0`.
