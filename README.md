# Muscle Memory

A developer job from before AI: tickets on a board, an IDE, tests and pull requests, and nobody writing the code for you. Practise the craft of writing code yourself, with private feedback and room to improve.

Created by [Ekku Leivonen](https://github.com/ekkuleivonen), inspired by a developer’s observation of fading coding fluency while using AI more often. That observation is a starting question, not evidence of causation. Open source and initially free; pre-release. Only an owner-only preview is hosted, behind Cloudflare Access; there is no public service yet.

After accepting the Terms and Privacy Notice, practice records are collected locally and uploaded to the configured ingest service. Individual results stay private unless shared. Community comparisons appear only when published aggregate data is available. Model benchmarks and research publications are planned. Stealth excludes records from future publications and community comparisons, but does not stop capture or uploads.

A **project** holds **issues**. An issue has a permanent key (SHOP-1) and live metadata; what a player works against is an immutable **revision**: its repo, cases, teammate comments and hints, stored under the SHA-256 of its content. See the [issue model](docs/issue-model.md).

## Run it

The product app uses Next.js and TypeScript. With Node.js 22+:

```sh
npm ci
npm run dev
```

`npm run dev` uses webpack, like production builds: Turbopack turns imported JSON into object literals, where a fixture key `__proto__` is silently dropped. The server also re-checks every revision's content hash on load, so altered content fails loudly.

Open http://localhost:3000. `/` is the public front page and `/play` the [five-minute test](docs/play.md). Every other page needs the [Terms and Privacy Notice](docs/legal.md) (`/terms`, `/privacy`) accepted, one click at `/consent`, which then goes on to the page that sent you there; a cookie holding only the Terms version lets pages skip it afterwards. There is no onboarding: questions about you (experience, AI use, languages, goal, editor keys) come up one at a time where they matter, and can always wait ([profile](docs/profile.md)). Browse `/issues` and `/projects` (an issue lives at its permanent key, e.g. `/issues/FN-1`, and a project at its unique key, e.g. `/projects/FN`) with search and filters in the URL. Setting an issue's status to Todo or In progress (Status menu, `s`) puts it on your board at `/board`, and `is:todo` (or `is:backlog`, `is:in-progress`, `is:done`) finds issues by board status; Done is never set from the Status menu: in the IDE you run the tests as often as you like, then open a pull request. CI checks it and it stays open; keep pushing to it until its checks pass, then review it and merge it yourself (merging is blocked while any check fails), which moves the issue to Done, or close it without merging and start a new one. Every pull request is kept at `/pulls` (searchable like issues, plus `is:open`/`is:merged`/`is:closed` and `checks:passed`/`failed`/`errored`) as the record of that attempt: what happened between it and the previous one (edits, test runs, how long it took), each check with its input, expected value and what came back, and the diff from the starter code. Pull requests and the board live in this browser only, and each status change is recorded there as [board activity](docs/board-activity.md). **Settings** at the bottom of the sidebar opens `/settings`, a terminal that shows your anonymous handle (handed out at random, Reddit-style; mocked in the browser until accounts exist) and holds everything about the account as commands: `theme` (light, dark or the system's), `profile` (your answers), `privacy` (going stealth: out of published stats and comparisons, and no one else's stats in return), `export` and `import` (everything this browser holds, as one file, to keep or to move to another browser), `logout`, `reset` (progress) and `delete` (the account and everything this browser holds, uploads included). Log out ends the cookie session and keeps local data; `/consent` then offers to sign back in. **Start work** opens the issue in [the IDE](docs/workspace.md) at `/work/<KEY>`: a VS Code-style editor on the issue's repo (your file, the acceptance tests in that language's style, the project README), with Vim keybindings if you chose them. Python, JavaScript, TypeScript, SQL (real Postgres, via PGlite), HTML, PHP, Ruby, Go, C, C++, C# and Java run only inside a network-denied browser sandbox, never on a server; other languages are editable until they have a runner.

```sh
npm test
npm run build
npm run build:cloudflare
```

See [Cloudflare build notes](docs/cloudflare-build.md). No account or deployment is required for local builds.

Content is seed data for now: `content/seed.ts` holds the projects and issues, and `npm run build:content` turns it into `content/catalog.json` (each issue's repo generated, each revision hashed; earlier revisions are kept). `npm run check:content` fails if the catalog is out of date. An admin system with a database will replace the seed.

## Monorepo

- `apps/web`: the Next.js app: home page, dashboard, issues, projects, board, IDE and pull requests.
- `packages/content`: the issue model (metadata, revisions, catalog), validation and revision hashing.
- `packages/domain`: pure contracts for recorded data: workspace and board observations, JSON canonical form.
- `packages/capture`: bounded, ordered capture of workspace observations with retry and gap disclosure, and exact code restore.
- `packages/browser`: device-local storage (IndexedDB).
- `packages/runner`: sandboxed in-browser runtimes, one engine per language (Pyodide, the browser's JavaScript engine with Sucrase, PGlite, linkedom, php-wasm, ruby.wasm, Yaegi for Go, Clang for C and C++, Roslyn on .NET for C#, teavm-javac for Java) behind one opaque-origin, network-denied iframe.
- `content`: the seed (`seed.ts`) and the built catalog (`catalog.json`).
- `docs`: the [issue model](docs/issue-model.md), the [IDE and runners](docs/workspace.md), [recorded data](docs/observations.md), [board activity](docs/board-activity.md) and [legal](docs/legal.md).

See [contributing](CONTRIBUTING.md) and [security](SECURITY.md). Licensed under MIT.

To open the dev server from another device, add `ALLOWED_DEV_ORIGINS=<lan-ip>` and pass `-- -H 0.0.0.0`.
