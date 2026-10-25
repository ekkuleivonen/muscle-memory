# Contributing

Start with the README setup. Keep changes small, with a commit message that says why, and keep docs in step with behaviour in the same change.

## Content

Challenges are seed data in `content/seed.ts` (and `content/more/`) until the admin system exists. A new challenge needs a clear task, its permanent key (the next free number in its language, such as `PY-011`; see [keys](docs/challenges.md#keys)), a difficulty and tags, an entry point and starter in its language, cases including edge cases (with the hidden ones marked), and any rules. Give it a `private` part: a reference solution, alternatives and wrong solutions where its language asks for them, and for every rule code that fires it and code that does not. The build refuses a challenge whose private part fails the publish checks, and `npm run check:publish` runs it in the browser sandbox. The private part is never written to the catalog. After changing the seed, run `npm run build:content` and commit `content/catalog.json` with it; `npm run check:content` fails when the two disagree.

Never edit `content/catalog.json` by hand. A revision is immutable and stored under the hash of its content: editing a challenge's task, files, cases or rules makes a new revision; title, summary, difficulty and tags change in place. See [challenges](docs/challenges.md).

## Checks

`npm test` and `npx tsc --noEmit -p apps/web` before a PR; `node tools/browser/sandbox-check.mjs chromium` after touching the runner or a worker. Do not put real participant records, credentials, private notes or generated exports in this repository.

Open a focused PR describing the behaviour, a runnable check and any limitation.
