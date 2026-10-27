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

GitHub Actions deploys every push to `main` (`.github/workflows/ci.yml`), after the tests, the typecheck and the Cloudflare build pass: first the ingest Worker (`apps/ingest`), so it accepts what the new app records, then the app. Deploys from `main` run one at a time. Cloudflare's Workers Builds is switched off: it has no Docker, which the Go, C# and Java runners are built in.

CI authenticates with the repository secret `CLOUDFLARE_API_TOKEN`, an account API token named "muscle-memory deploy (GitHub Actions)" limited to this account and the `musclememory.run` zone: Workers Scripts edit, Workers Routes edit, DNS edit (the app's custom domain), Account Settings read, and R2 and Pipelines read (the ingest Worker's bindings). Never commit a token.

After a merge, check the run, and `npx wrangler deployments list --name muscle-memory` for the new version. A manual deploy is the same commands run locally with Node 22 and Docker: `npm run build:cloudflare`, then `npx wrangler deploy --config apps/ingest/wrangler.jsonc --env=""` and `npx wrangler deploy --config apps/web/wrangler.jsonc`. The erasure Worker (`apps/erasure`) is not deployed by CI, since it needs a Containers permission CI's token lacks; deploy it by hand ([telemetry](telemetry.md#setup)).
