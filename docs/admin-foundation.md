# Admin foundation — ENG-353 draft

Status: investigation and implementation plan, not deployed or live-protected.

## Verified baseline

Started from main `5340e7c4000be9398271e2fd6dd2c43010dc07ba` on 26 October 2026.
The public Next.js 16 / OpenNext app is the Cloudflare Worker `muscle-memory`,
custom domain `musclememory.run`. The separate ingest Worker handles `/ingest/*`.
GitHub Actions builds and deploys main; Cloudflare Workers Builds is disabled.
The web Worker currently has no runtime variables/secrets and its self-service
binding only. Repository configuration disables workers.dev and preview URLs.

Read-only Cloudflare dashboard inspection showed 17 Access applications, none
for Muscle Memory. Historical ENG-312 protection is not current protection.
An anonymous `/admin` request reached the app's 404, not an Access login.
The earlier whole-host owner preview must not be restored: player routes and
uploads are public. The live Domains panel also confirmed production workers.dev
and wildcard version-preview URLs both off, with only `musclememory.run` listed.

## Proposed implementation

- A server-only shared Access assertion verifier. Validate RS256 signature from
  the configured team's JWKS, exact issuer and application audience, expiry,
  not-before, identity type and exact operator email. Missing configuration or
  failed key retrieval denies access. Never trust an email header or token-supplied
  key URL. No local bypass or production fixture keys.
- Guard all `/admin` pages and `/api/admin` handlers, and require the same verifier
  directly inside each data/action boundary. Host checks reject alternate hosts;
  no private data may depend on client navigation or a parent layout alone.
- Enforce canonical same-origin requests for any state-changing handler, including
  server actions. Authentication alone is not CSRF protection. Fail closed before
  invoking mutations. Do not create lifecycle or benchmark mutations in this slice.
- A read-only published challenge inventory derived from current catalog metadata.
  Draft/archive management, benchmark jobs and aggregate statistics explicitly say
  unavailable; no invented status, count, working controls or player information.
- Minimal typed operator audit primitive for future guarded actions, without
  player telemetry, JWTs, cookies, secrets or unnecessary identifiers. Durable
  storage/log configuration requires a separately reviewed proposal; no silent
  resource creation and no claim of durable audit before it exists.
- Signed test fixtures exercise allowed identity and adversarial claims; browser
  tests cover page/API denial and public-route continuity. These are local proofs,
  not proof of a real live Cloudflare policy or operator login.

## Live changes requiring explicit approval later

Create one self-hosted Access application scoped to `musclememory.run/admin` and
its descendants plus the chosen admin API namespace. Allow only
`ekku.leivonen@gmail.com`, with no domain rule or bypass. Use the existing login
provider; do not create credentials. Read its AUD and team issuer and configure
non-secret verifier values for the web Worker through reviewed deployment config.
Keep public `/`, challenges, practice, sharing and `/ingest/*` outside Access.
Verify workers.dev and version previews remain disabled and test alternate paths
and hosts. Exact application paths/settings and any operator audit destination
will be finalized in the reviewed draft before requesting action-time approval.

Reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## Boundaries

No live settings, credential, security-policy or hosting changes; no merge or
deployment under the current start authorization. No ENG-354/355/342 implementation,
model calls, event/capture schema, player telemetry or unrelated changes.

## Concrete approval bundle (not applied)

Read-only Zero Trust Settings confirmed the current team domain is
`elei.cloudflareaccess.com`; the issuer is `https://elei.cloudflareaccess.com`.
The app AUD does not exist yet and must be copied from the newly created app.

Proposed resource: account `166fd3dff06a9c3f1aef172a25db7ace`, one new self-hosted
Access application named **Muscle Memory admin**, destination hostname
`musclememory.run`, path `/admin*` (the UI may display the path without its leading
slash). This covers `/admin`, all descendants and all actual APIs under
`/admin/api/*`. One Allow policy named **Muscle Memory sole operator**, Include
**Emails** = exactly `ekku.leivonen@gmail.com`, no other Include/Require/Exclude,
Bypass, service-auth, domain or additional identity rule. Proposed session duration:
1 hour. Use the existing One-time PIN login method only, with no new IdP or
credentials. Read-only login-provider verification is still pending.

After explicit action-time approval:

1. Create and reopen the application/policy to verify the exact saved paths,
   email and login settings. Keep the player hostname's other paths public.
2. Read the new AUD. Add non-secret `ADMIN_ACCESS_ISSUER` (the issuer above) and
   `ADMIN_ACCESS_AUD` (the actual new AUD) to reviewed web Worker config; no tokens
   or secrets in Git. Missing configuration intentionally keeps admin closed.
3. Obtain green CI on that final config/code tree, merge only with approval, and
   use the existing main deployment pipeline. It deploys unchanged ingest code
   first, then web; no ingest contract, player event or capture change is proposed.
4. Verify anonymous login redirect at admin root/descendants/API, authenticated
   exact-email operator access, wrong identity denial where an authorized test
   identity is available, expiry and alternate paths/hosts. Recheck public home,
   picker, practice, sharing and ingest availability. Local signatures cannot prove
   these real Access checks. Do not authenticate as another person or generate
   additional credentials for a negative test.

Rollback: revert the admin code/config through a reviewed Git revert and the same
pipeline. Retain the path-scoped Access application while code is rolled back;
previous code serves no admin feature, and keeping that gate avoids exposure.
If the new policy accidentally gates public paths, correct only the newly added
application's destinations back to this exact approved path and verify public
routes. No whole-host policy, alternate hostname activation, credential rotation,
security weakening or deletion is proposed.

## Local proof and remaining gates

Current local source contains the verifier, edge middleware plus direct page/API
checks, published metadata shell, same-origin mutation guard and an unused typed
operator-audit primitive. There are no lifecycle mutations, durable audit sink,
model/benchmark service or player-statistics query. A failed audit pre-write stops
future wrapped mutations; it does not claim an atomic database transaction or
exactly-once audit semantics.

20 signed security tests and the full 162-test suite passed, as did typecheck and
the Cloudflare build. The local built-Worker harness passed 48 request checks plus
browser shell/sections, anonymous and expired reload denial, mobile viewport,
operator-recording exclusion and normal public-recording checks. It uses ephemeral
signed keys, an intercepted fixture JWKS endpoint and an ingress adapter that
restores URL Host/Origin across Miniflare's loopback transport. It serves exact
built static assets locally and blocks all synthetic uploads. It never contacts
production or claims a live Access login. The final scoped table styling passed
the build/browser rerun, and all four CI checks passed at `e54d7ca7a9f5cf0e8ebe8ad2f3a1f516008763d7`.

Independent static review found no authorization bypass and identified one
inherited-property section-routing error; `Object.hasOwn` now rejects those names
with 404, verified by the built-Worker checks. No live configuration has changed.

Reproduce: `npm test`, `npm run typecheck`, `npm run build:cloudflare`, then
`WRANGLER_LOG_PATH=/tmp/mm-admin-wrangler.log node tools/browser/admin-check.mjs`.
Serialize heavy commands with the existing shared heavy-check lock. Browser proof
receipts are written to `/tmp/mm-eng353-security-receipts.json`.
