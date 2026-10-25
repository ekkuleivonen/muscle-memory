# Contributing

Start with the README setup. Keep changes small, with a commit message that says why, and keep docs in step with behaviour in the same change.

## Content

Each challenge is a folder, `content/challenges/<KEY>/`, named by its permanent key (the next free number in its language, such as `PY-011`; see [keys](docs/challenges.md#keys)). It holds `challenge.json` (title, summary, difficulty, tags, the file's name and entry point), `task.md`, the starter under its own file name, `cases.json` (with the hidden ones marked), any `rules.json`, and `private/`: a solution, alternatives and wrong solutions where its language asks for them, and for every rule code that fires it and code that does not. One file is everything the player writes and reads: code the function uses goes in the same file, below it. See [challenges](docs/challenges.md#adding-a-challenge).

`npm run build:content` checks every challenge and builds `content/catalog.json`; it runs before dev, builds and tests, and the catalog is never committed. It also archives each new revision in `content/revisions/`: commit those files with the change. `npm run check:publish` runs each challenge's private solutions in the browser sandbox. A revision is immutable and stored under the hash of its content: changing a challenge's task, file, cases or rules makes a new revision; title, summary, difficulty and tags change in place.

## Checks

`npm test` and `npx tsc --noEmit -p apps/web` before a PR; `node tools/browser/sandbox-check.mjs chromium` after touching the runner or a worker. Do not put real participant records, credentials, private notes or generated exports in this repository.

Open a focused PR describing the behaviour, a runnable check and any limitation.
