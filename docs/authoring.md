# Authoring lifecycle

Adventure and Challenge versions move through a local catalog before attempts can start:

```text
draft → preview → tested → published → retired
                               │           │
                               └───────────┴──→ disabled (immediate, terminal)
```

The catalog is a JSON file on your machine. There is no hosted admin service, database or web UI. Use synthetic content and data only.

## Run it

With Node.js 22+ and `npm ci` done:

```sh
node --import tsx tools/authoring/cli.ts demo
node --import tsx tools/authoring/cli.ts demo
node --import tsx --test packages/catalog/*.test.ts
```

The first `demo` run takes the reference manifests in `content/` through preview, test and publish. It then checks attempt eligibility, retires the Adventure, completes an in-flight synthetic attempt and disables the Challenge. It writes `private/authoring-demo/catalog.json`, which git ignores. The second run reloads that file as if after a restart and shows that the states are kept and published content is still frozen. To repeat the full walkthrough, delete `private/authoring-demo`.

To author your own content, use the individual commands. They use `private/authoring/catalog.json` by default, or pass `--catalog <file>`:

```sh
node --import tsx tools/authoring/cli.ts draft challenge content/challenges/frequency-map.v1.json
node --import tsx tools/authoring/cli.ts preview challenge frequency-map 1.0.0
node --import tsx tools/authoring/cli.ts test challenge frequency-map 1.0.0
node --import tsx tools/authoring/cli.ts publish challenge frequency-map 1.0.0
node --import tsx tools/authoring/cli.ts draft adventure content/adventures/field-notes.v1.json
# preview, test and publish the adventure the same way
node --import tsx tools/authoring/cli.ts can-start field-notes 1.0.0
node --import tsx tools/authoring/cli.ts retire adventure field-notes 1.0.0
node --import tsx tools/authoring/cli.ts disable challenge frequency-map 1.0.0 fixture leaked
node --import tsx tools/authoring/cli.ts list
node --import tsx tools/authoring/cli.ts history challenge frequency-map 1.0.0
```

## States and rules

| State     | Edit content          | Start new attempt | Complete in-flight attempt | Read snapshot |
| --------- | --------------------- | ----------------- | -------------------------- | ------------- |
| draft     | yes                   | no                | no                         | yes           |
| preview   | yes (back to draft)   | no                | no                         | yes           |
| tested    | yes (back to draft)   | no                | no                         | yes           |
| published | no, add a new version | yes               | yes                        | yes           |
| retired   | no                    | no                | yes                        | yes           |
| disabled  | no                    | no                | no                         | yes           |

- **Draft** stores a canonical copy of the manifest. Saving identical content again changes nothing. Saving changed content to a preview or tested version returns it to draft and clears its test result.
- **Preview** re-validates the source manifest with the same checks as `tools/content-check.mjs`. For an Adventure, every pinned `[id, version]` must exist in the catalog and must not be disabled.
- **Test** scores each Challenge's expected outputs through `assess()` from `packages/domain`. It records the passing result against the content's SHA-256 digest. This catches unsupported assessment versions and fixtures that cannot be scored. It does not run a reference solution or any submitted code. An Adventure can only be tested once every Challenge it pins is `published`, and its test runs those Challenges' fixtures. An unpublished Challenge can still change under the same version, so this rule stops an Adventure test result from going stale.
- **Publish** needs a test result for the exact current digest. An Adventure can only be published once every referenced Challenge version is `published`; retired, disabled, tested or missing Challenges are rejected. After publication, the content for that id/version is frozen. Saving different content under the same id/version fails, so a change needs a new version.
- **Retire** is for planned removal. No new attempts start, but attempts that already started can still be assessed against the frozen snapshot. Old results and snapshots stay readable.
- **Disable** is for problems that must stop now, such as a leaked answer or broken fixture. It needs a reason. It blocks new attempts _and_ assessment of attempts already in flight. Snapshots and history stay readable. Disabled is terminal, so publish a fixed new version instead. A disabled Challenge cannot be referenced by new Adventure drafts.

Attempt eligibility checks both the Adventure and the Challenge at the chosen position. `startAttempt` needs both to be `published`. `assessAttempt` needs both to be `published` or `retired`. `assessAttempt` also requires the attempt's encounter to match the exact Adventure snapshot: the same presentation, the full Challenge order, and a position that points at the attempted Challenge. Clues shown are kept as recorded context. Because both states are checked, retiring or disabling a Challenge also stops starts at that position in every Adventure that pins it.

Every change appends a history entry with action, from/to state, content digest, time and an optional note. Nothing is deleted, and old versions stay in the catalog next to new ones. Story, sequence and presentation stay in Adventure manifests. Tasks, fixtures, hints, skills and assessment version stay in Challenge manifests. The catalog does not interpret genre or presentation.

## Persistence and its limits

`packages/catalog/file-store.ts` writes a synced temporary file, then atomically renames it over the catalog. A crash leaves either the old or the new file. On load, every entry is checked: its key must match its content identity, the content must match its recorded digest, the history must end in the current state, and frozen content must match the digest recorded at publication. A hand edit to published content is rejected on reload.

The local file is not a tamper-proof ledger. Someone who rewrites content, digests and history together can change it. There is no locking, so run one author process at a time. The reference app and synthetic event CLI now use lifecycle eligibility gates. See the release boundary below; this remains local development, not a hosted admin service.

## Module layout

- `packages/catalog/catalog.ts`: pure lifecycle functions. Each takes a catalog and returns a new one.
- `packages/catalog/gates.ts`: browser-compatible start and assessment eligibility; no filesystem or Node crypto imports.
- `packages/catalog/file-store.ts`: JSON load/verify and atomic save.
- `packages/catalog/catalog.test.ts`: focused tests for transitions, test invalidation, references, frozen content, retire versus disable and reload.
- `tools/authoring/cli.ts`: local CLI and demo.

The root, web app, catalog and authoring tools use ES modules, sharing the domain directly. Only Node authoring imports the source validators and hashing implementation.

## Reference app release boundary

`npm run build:reference-catalog` takes the committed synthetic source manifests through the real draft, preview, test and publish functions. It writes deterministic `content/catalog/reference.v1.json`; `npm run check:content` rejects a stale release fixture. This command generates the reference release, not a general catalog administration backend.

The app serves that public content from read-only `GET /api/catalog` with `Cache-Control: no-store`. Before each start or assessment it fetches the current release and applies the shared gates. No answers, participant identifiers or results are sent. Retired content rejects starts but accepts in-flight assessment; disabled content rejects both. The synthetic event CLI verifies the same release and gates before durable event creation/export.

The endpoint reads the deployed release artifact. Changing a private CLI catalog does **not** change an already running app. Live lifecycle administration and immediate revocation across deployments remain unimplemented; a release update/rebuild is required. The browser is a practice client, not a trusted assessment authority. The focused application-gate test simulates successive published, retired and disabled releases without collecting user data.

## Display metadata

Challenges may set `title` (up to 60 characters), `summary` (up to 160), `difficulty` (`warm-up`, `easy`, `medium` or `hard`), `kind` (`feature`, `bug`, `performance` or `refactor`) and `comments`: authored remarks from the fictional team, each with an `author`, optional `role` and `body`. Comments are content, not participant posts; hints stay in `hints` because Attempts record which ones were shown. Adventures may set `title`, `summary` and `key`, a 2–5 character uppercase prefix for issue keys such as `NS-2` (derived from the id when absent). Challenges set `number`, their permanent issue number within that project, so the key `RG-4` and its URL `/issues/RG-4` never change meaning: keys and numbers cannot change between versions, numbers are never reused, and within one Adventure version all pinned Challenges have numbers or none do; their difficulty comes from their Challenges. The fields are optional because earlier published versions predate them, and adding them to published content means publishing a new version, as with `frequency-map` 2.1.0 and `field-notes` 2.0.0.

## One project per issue

The app presents Adventures as projects and Challenges as issues, and an issue belongs to exactly one project: its key (`NS-2`) is the project key and its permanent issue number. So each Challenge id may be pinned by only one Adventure id, once. New versions of that Adventure may keep pinning it, and retiring or disabling the Adventure releases it. `check:content` and the authoring lifecycle both enforce this; reusing a Challenge elsewhere means authoring it under a new id.
