# Muscle Memory

A developer job from before AI: tickets on a board, an IDE, tests and pull requests, and nobody writing the code for you. Practise the craft of writing code yourself, with private feedback and room to improve.

Created by [Ekku Leivonen](https://github.com/ekkuleivonen), inspired by a developer’s observation of fading coding fluency while using AI more often. That observation is a starting question, not evidence of causation. Open source and initially free; pre-release. Only an owner-only preview is hosted, behind Cloudflare Access; there is no public service yet.

With voluntary research participation, we also hope to study how developer skills evolve over time and compare with coding models through aggregate results. Individual results stay private. Research collection and model benchmarking are later work; the current demo uses synthetic data only.

A **project** holds **issues**. An issue has a permanent key (SHOP-1) and live metadata; what a player works against is an immutable **revision**: its repo, cases, teammate comments and hints, stored under the SHA-256 of its content. See the [issue model](docs/issue-model.md).

## Run it

The product app uses Next.js and TypeScript. With Node.js 22+:

```sh
npm ci
npm run dev
```

`npm run dev` uses webpack, like production builds: Turbopack turns imported JSON into object literals, where a fixture key `__proto__` is silently dropped. The server also re-checks every revision's content hash on load, so altered content fails loudly.

Open http://localhost:3000. First visits go to `/onboarding`, a one-time terminal-style setup that starts with accepting the [Terms and Privacy Notice](docs/legal.md) (`/terms`, `/privacy`) and whose answers stay in the browser; a cookie holding only the setup version lets pages skip it afterwards, and signed-in visits to `/onboarding` go straight on. `/` is the public front page; setup ends on the dashboard at `/dashboard`, or on the page that redirected there. Browse `/issues` and `/projects` (an issue lives at its permanent key, e.g. `/issues/FN-1`, and a project at its unique key, e.g. `/projects/FN`) with search and filters in the URL. Setting an issue's status to Todo or In progress (Status menu, `s`) puts it on your board at `/board`, and `is:todo` (or `is:backlog`, `is:in-progress`, `is:done`) finds issues by board status; Done is never set from the Status menu: in the IDE you run the tests as often as you like, then open a pull request. CI checks it and it stays open; keep pushing to it until its checks pass, then review it and merge it yourself (merging is blocked while any check fails), which moves the issue to Done. Every pull request is kept at `/pulls` (searchable like issues, plus `is:open`/`is:merged` and `checks:passed`/`failed`/`errored`) as the record of that attempt: what happened between it and the previous one (edits, test runs, how long it took), each check with its input, expected value and what came back, and the diff from the starter code. Pull requests and the board live in this browser only, and each status change is recorded there as [board activity](docs/board-activity.md). The profile menu at the bottom of the sidebar shows your anonymous handle (handed out at random, Reddit-style; mocked in the browser until accounts exist) and leads to `/settings`, the same terminal as onboarding with settings as commands: `profile` (the setup answers), `privacy` (going stealth: out of published stats and comparisons, and no one else's stats in return), `logout`, `reset` (progress) and `delete` (the account and everything this browser holds). Log out ends the cookie session and keeps local data; the terminal then offers to sign back in. No practice records are uploaded. **Start work** opens the issue in [the IDE](docs/workspace.md) at `/work/<KEY>`: a VS Code-style editor on the issue's repo (your file, the acceptance tests in that language's style, the project README), with Vim keybindings if you chose them. Python, JavaScript, TypeScript, SQL (real Postgres, via PGlite), HTML, PHP, Ruby, Go, C, C++, C# and Java run only inside a network-denied browser sandbox, never on a server; other languages are editable until they have a runner.

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
