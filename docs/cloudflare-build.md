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

The app's `prebuild` step builds the pinned in-browser runtimes (Pyodide, Sucrase, PGlite, linkedom, php-wasm, ruby.wasm, Clang, and the Go, C# and Java runners, which are built in Docker; hash-verified, none over the 25 MiB per-file limit) into `public/runtime/`; it is served as static assets and never fetched from a CDN. See [workspace](workspace.md).

The adapter build invokes Next with the standalone output it needs. A regular Next build alone is not sufficient input for `--skipNextBuild`; use the complete adapter command above.

No deploy/upload script is provided. The app has no database, R2 bucket or credential bindings: practice state lives in the browser's IndexedDB. Recorded practice is uploaded to a separate ingest Worker (`apps/ingest`, see [telemetry](telemetry.md)), which has an R2 bucket and a Pipelines stream of its own.

Wrangler is pinned to a compatible patch that fixes a transitive sharp advisory. The root override raises the build-only `@node-minify/core` glob dependency to 10.5.0, which fixes its command-injection advisory. A clean install reported zero npm vulnerabilities. Revisit the override when upstream removes the older glob pin.

## Public deployment

The Worker serves the custom domain `musclememory.run`, with `workers.dev` and version preview URLs disabled. The site is public: the app, quick start (`/start`), shared results (`/r/*`) and their preview images, and `/ingest/*` (the ingest Worker, [telemetry](telemetry.md)) are reachable without signing in. Accepting the Terms at `/consent` (or by starting from `/start`) is the only gate, and it is the app's, not Cloudflare's.

Cloudflare Access is kept for what must stay private: the future admin routes, when they exist, get their own Access application with an owner-only email rule. Do not put Access back in front of the whole hostname; shared links and uploads would stop working for everyone else.

For Cloudflare Workers Builds, use the repository root, build command `npm run build:cloudflare` (it builds the catalog and runtimes first), and deploy command `npx wrangler deploy --config apps/web/wrangler.jsonc`. Select `main` only and disable nonproduction branch deployments. Use existing authorized integrations; never commit API tokens. After a merge, check that a build ran (`npx wrangler deployments list --name muscle-memory` shows a new version); a manual deploy is the same build and deploy commands run locally with Node 22.

The ingest Worker deploys separately: `npx wrangler deploy --config apps/ingest/wrangler.jsonc --env=""`, needed whenever a capture version or the ingest code changes.
