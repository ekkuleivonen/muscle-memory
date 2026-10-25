# Contributing

Start with the README setup. Keep changes small, with a commit message that says why, and keep docs in step with behaviour in the same change.

## Content

Issues are seed data in `content/seed.ts` until the admin system exists. A new issue needs a clear ticket, its permanent key (the next free number in its language, such as `PY-011`; see [keys](docs/issue-model.md#keys)), an entry point and starter in its language, cases including edge cases, skill tags, and teammate comments and hints where they help. Give it a `private` part where you can: a reference solution, and for every blocking review comment code that fires it and code that does not. The build refuses an issue whose private part fails the publish checks, and `npm run check:publish` runs the reference and the starter in the browser sandbox. The private part is never written to the catalog. After changing the seed, run `npm run build:content` and commit `content/catalog.json` with it; `npm run check:content` fails when the two disagree.

Never edit `content/catalog.json` by hand. A revision is immutable and stored under the hash of its content: editing a seed issue adds a new revision and moves the issue's live pointer to it, and earlier revisions stay because recorded work names them. Change live metadata (title, difficulty, labels) freely; change revision content (ticket, files, cases, comments, hints) only by adding a revision. See the [issue model](docs/issue-model.md).

## Checks

`npm test` and `npx tsc --noEmit -p apps/web` before a PR; `node tools/browser/sandbox-check.mjs chromium` after touching the runner or a worker. Do not put real participant records, credentials, private notes or generated exports in this repository.

Open a focused PR describing the behaviour, a runnable check and any limitation.
