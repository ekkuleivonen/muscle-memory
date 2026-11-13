# Next.js and Cloudflare build rehearsal

The app uses Next.js 16.4.3, React 19.3.1, OpenNext Cloudflare 1.20.13 and Wrangler 4.152.0. Exact package versions are pinned in manifests and npm's lockfile. Node.js 22 is the local/CI baseline.

The [OpenNext guide](https://opennext.js.org/cloudflare/get-started) documents the adapter build and local Workers preview. [Its runtime guidance](https://opennext.js.org/cloudflare) uses Next.js's Node runtime with Cloudflare's Node compatibility flag, rather than an Edge runtime declaration. We use `nodejs_compat`, a compatibility date of 2026-10-23, and the standard `.open-next/worker.js` and assets paths.

```sh
npm ci
npm test
npm run build
npm run build:cloudflare
npm run preview --workspace apps/web
```

The app's `prebuild` step builds the pinned in-browser runtimes (Pyodide, Sucrase, PGlite, linkedom, php-wasm, ruby.wasm, Clang, and the Go, C# and Java runners, which are built in Docker; hash-verified, none over the 25 MiB per-file limit) into `public/runtime/`; it is served as static assets and never fetched from a CDN. See [workspace](practice.md).

The adapter build invokes Next with the standalone output it needs. A regular Next build alone is not sufficient input for `--skipNextBuild`; use the complete adapter command above.

The app's managed challenge catalog uses the `CATALOG_DB` D1 binding and private `CONTENT` R2 binding (see [admin challenge management](admin-challenge-management.md)). Player practice state remains in the browser's IndexedDB. Recorded practice is uploaded to a separate ingest Worker (`apps/ingest`, see [telemetry](telemetry.md)), which has an R2 bucket and a Pipelines stream of its own.

Wrangler is pinned to a compatible patch that fixes a transitive sharp advisory. The root override raises the build-only `@node-minify/core` glob dependency to 10.5.0, which fixes its command-injection advisory. A clean install reported zero npm vulnerabilities. Revisit the override when upstream removes the older glob pin.

## Public deployment

The Worker serves the custom domain `musclememory.run`, with `workers.dev` and version preview URLs disabled. The site is public: the app, quick start (`/start`), shared results (`/r/*`) and their preview images, and `/ingest/*` (the ingest Worker, [telemetry](telemetry.md)) are reachable without signing in. Accepting the Terms at `/consent` (or by starting from `/start`) is the only gate, and it is the app's, not Cloudflare's.

Cloudflare Access is kept for what must stay private: the `/admin*` routes have their own Access application with an owner-only email rule, plus server-side JWT verification. Do not put Access back in front of the whole hostname; shared links and uploads would stop working for everyone else.

## Deploying

Production is deployed from the operator's Mac, not CI (13 November 2026,
[ENG-660](https://linear.app/rowandreason/issue/ENG-660)). Run it from a clean checkout of
`origin/main` with Node 22 and Docker:

```sh
npm ci
npm run deploy -- --dry-run   # everything below, with wrangler's --dry-run: uploads nothing
npm run deploy                # catalog pull, test, typecheck, build:cloudflare, ingest, then the app
```

`tools/deploy.mjs` takes `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from Infisical
`company-platform` / `prod` / `/cloudflare`, the account's one central token. They exist only
in that process and its wrangler and npm children: never in argv, a file, `.dev.vars` or a
GitHub secret. Without `INFISICAL_TOKEN`, the script re-runs itself under the homelab operator
loader (`scripts/operator_env.py --token-only` in `~/homelab`, or `HOMELAB_CHECKOUT`), which logs
in with the Infisical bootstrap and revokes its token afterwards. A real deploy refuses a dirty
checkout or one that isn't `origin/main`. It deploys the ingest Worker first, so it accepts what
the new app records, then the app. Locally, `catalog:pull` uses the same token. Cloudflare's
Workers Builds stays off, because it has no Docker for the Go, C# and Java runners.

CI still runs the tests and the Cloudflare build on every push, but it holds no deploy token.
After a deploy, check `npx wrangler deployments list --name muscle-memory` for the new version.
The erasure Worker (`apps/erasure`) is not deployed by CI, deploy it by hand ([telemetry](telemetry.md#setup)).
