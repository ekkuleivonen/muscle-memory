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

The adapter build invokes Next with the standalone output it needs. A regular Next build alone is not sufficient input for `--skipNextBuild`; use the complete adapter command above.

No deploy/upload script is provided. There are no remote database, R2 bucket or credential bindings. This app keeps practice state in the browser: session memory by default, optional IndexedDB after explicit local-storage consent. The local SQLite stores and retryable archive export in `packages/storage` are Node-only development tools and are not imported by the app; this is not a hosted multi-user application.

Wrangler is pinned to a compatible patch that fixes a transitive sharp advisory. The root override raises the build-only `@node-minify/core` glob dependency to 10.5.0, which fixes its command-injection advisory. A clean install reported zero npm vulnerabilities. Revisit the override when upstream removes the older glob pin.

## Verified reference slice

The Next production build and complete OpenNext build passed locally. `wrangler dev --local --port 8787` served the app with only local asset/self-reference bindings. Browser verification covered explicit local consent, Challenge presentation, invalid empty-answer feedback and a successful four-fixture submission. No remote resource was provisioned. Active time is unmeasured (`null`), so this slice does not score speed.

## Owner preview deployment

The Worker configuration reserves the custom domain `musclememory.run` and disables both `workers.dev` and version preview URLs. Before deploying, configure Cloudflare Access for the entire hostname with an explicit owner-only email rule. Do not add bypass policies or alternate public routes.

The app keeps practice records on the device; the hosted endpoint serves content only. Cloudflare Access is preview entry authentication, not a participant account or research consent system.

For Cloudflare Workers Builds, use the repository root, build command `npm run check:content && npm run build:cloudflare`, and deploy command `npx wrangler deploy --config apps/web/wrangler.jsonc`. Select `main` only and disable nonproduction branch deployments. Use existing authorized integrations; never commit API tokens. Deployment setup and anonymous-access verification are tracked in Linear before claiming the preview is live.

The owner preview is deployed behind Cloudflare Access. Anonymous app and catalog requests redirect to the login gate; alternate workers.dev and version URLs are disabled. The Cloudflare Git connection targets main with preview branch builds disabled. The first automatic build must be verified before treating update delivery as proven; the local Mac is not a hosting dependency.
