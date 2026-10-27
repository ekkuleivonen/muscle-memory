# Private challenge source (ENG-371)

D1 `muscle-memory-catalog` and private R2 `muscle-memory-content` are authoritative. The app uses their managed bindings in production. Build/authoring/test/model tools use an explicitly downloaded, gitignored `.local/catalog-copy.json`, never repository challenge folders. `content/catalog.json` is a generated public projection: cases needed by the browser are included, private QA is excluded.

## Local use

With existing authorized Cloudflare read access, run `npm run catalog:pull`. It reads the live catalog, every registered immutable revision and the matching private sources. A newer unpublished draft never replaces the private source for a published revision. If necessary, immutable draft copies are searched for an exact revision match. Catalog generation is checked before/after export; changed, unavailable or inconsistent data fails without overwriting the old copy. Copies are written atomically with private file permissions. The export does not create credentials, change permissions or write cloud data.

`npm run build:content` verifies hashes and source agreement, then writes only the public projection. Missing/invalid copies fail clearly; no network fallback, embedded answer fixture or repository archive fallback exists. Local copies are deliberately pinned until the operator explicitly refreshes them. `MM_CATALOG_COPY` can select an alternate private copy; the pull command only writes beneath `.local/`.

`npm run check:publish` checks every published challenge's reference, alternatives, wrong variants and rules using the existing browser sandbox. No paid model calls are needed. Headless model tools use the same loader; this change does not alter their protocol or event collection.

`tools/seed-catalog.ts` plans by default and can initialize a fresh local emulator from the copy, preserving current discovery and registered archived history. It never replaces a nonempty catalog. The former remote bootstrap script is read-only export now: production is the source, not a target to reseed from Git.

## CI and privacy

Public PR/fork checks run only synthetic loader contracts and unrelated public tests, with no catalog secret, copy or artifact. Full content tests/builds run on trusted pushes to this repository, using the existing `CLOUDFLARE_API_TOKEN` only during the read step. No `pull_request_target`, credential provisioning or permission expansion is used. If that existing token lacks D1 or private R2 read access, the trusted job fails at hydration; an owner-approved read-access change is required rather than a silent stale fallback. Fork contributors need an authorized local copy for full content checks.

Private-dependent checks put detailed logs in ephemeral `.local/checks` files, never public CI logs or artifacts. Do not upload catalog copies, private logs, generated fixtures, traces, screenshots of admin/private code, or build bundles as public CI artifacts. Public fixture tests use invented JS-900 data and no real challenge answers. Production deployment still serves public runtime cases; this is not secrecy from players or a change to the sandbox.

## Recovery and boundaries

Before removal, all 69 tracked private sources and 117 tracked archives were byte-verified against their existing managed objects. The recovery export additionally preserved current registration: 69 discoverable challenges, 70 heads, 118 versions and 190 referenced objects. No cloud content was deleted or changed. Git history, earlier clones and search caches are outside scope; no full-erasure or complete-secrecy claim is made.

A separate scan found real solutions in the old ENG-338 blind-solve candidate directory. Its 211 files were byte-verified into `.local/recovery/eng338-candidates` before removal from the public tree; the audit checklist, hashes and execution receipts remain tracked. Full-text scanning of 151 current reference/alternative implementations now finds no matches in tracked files. This is a scoped full-text check, not a guarantee against every equivalent algorithm or historical copy.
