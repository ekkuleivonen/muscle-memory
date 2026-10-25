# Muscle Memory

Coding practice without AI: a challenge, your code, feedback in seconds, then the next challenge. Practise the craft of writing code yourself, with private feedback and room to improve.

Created by [Ekku Leivonen](https://github.com/ekkuleivonen), inspired by a developer’s observation of fading coding fluency while using AI more often. That observation is a starting question, not evidence of causation. Open source and initially free; pre-release. Only an owner-only preview is hosted, behind Cloudflare Access; there is no public service yet.

After accepting the Terms and Privacy Notice, practice is recorded as raw event streams, stored in the browser and uploaded to the configured ingest service ([telemetry](docs/telemetry.md)): the aim is understanding how developers work, at scale. Individual results stay private unless shared. Community comparisons, model benchmarks and research publications are planned. Stealth excludes records from future publications and comparisons, but does not stop capture or uploads.

A **challenge** has a language, a difficulty (easy, medium, hard), tags and a permanent key (JS-003). What someone works against is an immutable **revision**: the task, the one file to edit, its cases and rules, stored under the SHA-256 of its content. See [challenges](docs/challenges.md).

## Run it

The product app uses Next.js and TypeScript. With Node.js 22+:

```sh
npm ci
npm run dev
```

`npm run dev` uses webpack, like production builds: Turbopack turns imported JSON into object literals, where a fixture key `__proto__` is silently dropped. The server also re-checks every revision's content hash on load, so altered content fails loudly.

Open http://localhost:3000. `/` is the public front page, `/start` is [quick start](docs/start.md) (pick a language, get an easy challenge) and `/manifesto` says why. Every other page needs the [Terms and Privacy Notice](docs/legal.md) (`/terms`, `/privacy`) accepted, one click at `/consent`, which then goes on to the page that sent you there; a cookie holding only the Terms version lets pages skip it afterwards. The site is a terminal: dark, monospace, and driven by keys as much as by clicks, with a status bar at the bottom showing where you are. `/challenges` is the picker for every challenge, like fzf: type to narrow (plain words, or `lang:python`, `difficulty:easy`, `tag:strings`, `is:starred`, `is:completed`), toggle the filters, star challenges (Ctrl-s), and read the highlighted challenge's task and examples in the preview; Enter opens it in [practice](docs/workspace.md) at `/challenges/<KEY>`. Practice is one editable file beside the challenge and its feedback; **Run examples** runs the examples as often as you like, and **Submit** checks every case, hidden ones included, and the challenge's rules. Passing them all completes the attempt; a completed challenge can be practised again. `/settings` holds everything about the account, each command its own page: `profile` (your answers), `privacy` (going stealth), `export` and `import` (everything this browser holds, as one file), `logout`, `reset` (progress) and `delete` (the account and everything this browser holds, uploads included). Python, JavaScript, TypeScript, SQL (real Postgres, via PGlite), HTML, PHP, Ruby, Go, C, C++, C# and Java run only inside a network-denied browser sandbox, never on a server.

```sh
npm test
npm run build
npm run build:cloudflare
```

See [Cloudflare build notes](docs/cloudflare-build.md). No account or deployment is required for local builds.

Challenges are folders of plain files in `content/challenges/<KEY>/` ([challenges](docs/challenges.md)); `npm run build:content` checks them and builds `content/catalog.json` (each revision hashed), before dev, builds and tests. An admin system with a database will replace the folders.

## Monorepo

- `apps/web`: the Next.js app: home, quick start, the challenge list, practice, sharing and settings.
- `apps/ingest`: the Worker that receives uploaded records.
- `packages/content`: the challenge model (metadata, revisions, catalog), validation, rules, publish checks and revision hashing.
- `packages/domain`: pure contracts for recorded data: the practice and site streams, ingest, JSON canonical form.
- `packages/capture`: bounded, ordered capture with retry and gap disclosure, and exact code restore.
- `packages/browser`: device-local storage (IndexedDB), compaction and the uploader.
- `packages/runner`: sandboxed in-browser runtimes, one engine per language (Pyodide, the browser's JavaScript engine with Sucrase, PGlite, linkedom, php-wasm, ruby.wasm, Yaegi for Go, Clang for C and C++, Roslyn on .NET for C#, teavm-javac for Java) behind one opaque-origin, network-denied iframe.
- `content/challenges`: every challenge, one folder each.
- `docs`: [getting started and sharing](docs/start.md), [challenges](docs/challenges.md), [practice and runners](docs/workspace.md), [what we record](docs/telemetry.md), [the profile](docs/profile.md), [legal](docs/legal.md) and the planned [model runs](docs/model-runs.md).

See [contributing](CONTRIBUTING.md) and [security](SECURITY.md). Licensed under MIT.

To open the dev server from another device, add `ALLOWED_DEV_ORIGINS=<lan-ip>` and pass `-- -H 0.0.0.0`.
