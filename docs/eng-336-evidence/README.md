# ENG-336 validation receipts

Source base: `961dd9b2f26d20e4382eb803411d0d3216cfbb8a`.
Source/test commit: `95a24cdd4d7502cc2fbd69ccd79bca3065d07f82`.
The final PR head (including these receipts) is supplied in its description and handoff. `revisions.json`
is the authoritative mapping of new keys to final immutable content hashes.
No existing challenge, revision, runtime, validator or manifest was changed.
Two catalog-size assumptions in app tests were corrected with ENG-335 ownership
coordination: compare indexed keys/count to the catalog, and request enough
candidates when checking that all eligible suggestions remain. No application
behavior changed. The initial 140/142 result is retained in `unit-tests-before.txt`;
`unit-tests.txt` is the rerun after these test-only corrections.

## Reproduce the bounded browser run

From the repository root, with dependencies and pinned runtime assets installed:

```sh
cp tools/browser/content-check.ts tools/browser/.eng336-content-check.ts
patch tools/browser/.eng336-content-check.ts docs/eng-336-evidence/publish-harness.diff
flock /tmp/muscle-memory-heavy-check.lock node --import tsx tools/browser/.eng336-content-check.ts
rm tools/browser/.eng336-content-check.ts
```

The diff only selects the 23 keys and adds stricter diagnostics: starters and
wrong variants must reach behavioral case evaluation without errors, not merely
fail compilation. It does not relax assertions or alter sandbox behavior.
The original check already requires reference twice, equality of repeated
outputs, all alternatives passing, starter failure and every wrong variant
failing. Rule checks run in the content build; these new tasks need no rules.
Optional positional keys narrow this already bounded run further.

`publish.txt` is the first successful new-only run. C-004 received an adapter
length guard and a third wrong variant; HTML received additional structural
cases and clearer examples; PHP source was formatted. `publish-final.txt`
supersedes those seven keys' lines from the first receipt. The other 16 case
sets and executable files are the ones checked in the first run. Both runs use
Chromium and the actual browser language runtimes; there is no host-language
substitution for any solution.

The initial browser run used Node 20.19.2 as the harness host. Final C/HTML/PHP,
repository tests and type checks use Node 22.23.4. Node is only the harness
host; challenge execution happens in each pinned browser runtime. Every staged
runtime file's hash and size was checked against runtime-manifest.json
([verification receipt](runtime-assets.json)).

Other receipts:

```sh
flock /tmp/muscle-memory-heavy-check.lock npm test
flock /tmp/muscle-memory-heavy-check.lock npm run typecheck
node --import tsx tools/build-content.ts --dry-run
```

`unit-tests.txt`, `typecheck.txt` and `content-build.txt` record those results.
Builds append immutable archives; retained earlier draft archives do not add
extra live challenges. `keys.txt` and `revisions.json` list only the 23 live
additions. `content/catalog.json` is generated and excluded from the commit.

Scope limits: this is exhaustive execution of all new cases and private
variants, not exhaustive enumeration of every possible input or a human
playthrough. Existing challenges are owned and checked by ENG-335. ENG-338 and
the release coordinator retain independent content/play review. HTML is tested
as parsed DOM structure; no rendered accessibility or interaction claim is made.
No full application build or engine-isolation rerun is needed for content-only
additions with unchanged application and engine code. No merge or deployment.
