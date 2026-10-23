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

The local file is not a tamper-proof ledger. Someone who rewrites content, digests and history together can change it. There is no locking, so run one author process at a time. Nothing outside this module reads the catalog yet. The Next.js app and the event store still load content directly and do not enforce lifecycle state. That wiring is part of the full reference acceptance gate in [foundation](foundation.md).

## Module layout

- `packages/catalog/catalog.ts`: pure lifecycle functions. Each takes a catalog and returns a new one.
- `packages/catalog/domain.ts`: ESM bridge to `packages/domain`. Node 22 under tsx does not expose named CommonJS exports to ES modules.
- `packages/catalog/file-store.ts`: JSON load/verify and atomic save.
- `packages/catalog/catalog.test.ts`: focused tests for transitions, test invalidation, references, frozen content, retire versus disable and reload.
- `tools/authoring/cli.ts`: local CLI and demo.

Both `packages/catalog` and `tools/authoring` are ES modules (`"type": "module"`), so they can reuse the validators in `tools/content-check.mjs`.
