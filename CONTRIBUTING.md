# Contributing

Start with the README setup. Keep changes small, with a commit message that says why, and keep docs in step with behaviour in the same change.

## Content

Create and edit challenges in the authenticated admin, preserving permanent IDs and immutable published revisions. D1/private R2 holds cases, private reference/alternative/wrong solutions and revision history. Public repository descriptions are reference material, not the build source.

For development, `npm run catalog:pull` reads managed storage into a gitignored copy using existing authorized read access. `npm run build:content` verifies it and emits only the public catalog. `npm run check:publish` runs its private QA in the browser sandbox. Never commit cases, solutions, private exports, traces or generated catalogs. See [private catalog development](docs/private-catalog.md) for trusted CI and missing-access behavior.

## Checks

`npm test` and `npx tsc --noEmit -p apps/web` before a PR; `node tools/browser/sandbox-check.mjs chromium` after touching the runner or a worker. Do not put real participant records, credentials, private notes or generated exports in this repository.

Open a focused PR describing the behaviour, a runnable check and any limitation.
