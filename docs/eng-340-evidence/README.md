# ENG-340 verification evidence

All populated screens use explicitly synthetic traces from `packages/developer-profile/fixtures.ts`. No participant code, private history, hidden cases or reference solutions appear. The local dev server had no ingest URL configured. This is UI evidence, not a human/model baseline.

- [Empty desktop](empty-desktop.png): new/reset browser, no fabricated metric values; all 69 catalog challenges unexplored. 1280 × 900.
- [Synthetic desktop](synthetic-desktop.png): two completed challenges, two unfinished attempts (one a repeat), one missing-source-position trace. Includes an imported synthetic summary to exercise the future history reader. **Production summary retention remains disabled** pending approved storage disclosure.
- [Synthetic mobile metric](synthetic-mobile-metric.png): 390 × 844; distinct runs counted once per run ID; three eligible traces and one excluded trace, with the reason and supporting attempt links.
- [Synthetic mobile stealth](synthetic-mobile-stealth.png): comparison details hidden; own private evidence retained.

Walkthrough: open `/stats`, filter language or observed repeats, expand Solving / testing, then Distinct runs. Read its definition/sample and follow an attempt link; its exact-revision timeline opens and receives keyboard focus. Enter toggles a focused summary; Tab reaches filters, refresh and links. Existing challenge links resume work; optional context goes to existing settings. Completion links to comparison availability without awaiting a baseline query.

Observed browser checks (T3 collaborative Chromium preview):

- Terms gate redirects a new browser to `/consent?next=/stats` and returns after acceptance.
- Empty and synthetic states render on desktop and at 390px with no main-content horizontal overflow.
- A synthetic gap excludes derived values, while the recorded completion and timeline remain labelled as observed evidence.
- Language/repeat filters and native keyboard summaries are reachable; attempt anchors open their enclosing timeline and focus it. Anchors include the exact revision to avoid collisions across revisions.
- Stealth removes the human/model availability details and optional context nudge while preserving own progress.
- An induced IndexedDB read failure keeps the previous snapshot and says “Previous view is stale.” Restoring storage and refreshing recovers.
- Settings → reset → confirm removes local evidence; returning to `/stats` shows 0 completed / 0 unfinished / 69 unexplored. Unit tests also verify local delete, backup restore and summary clearing.
- Human figures remain suppressed regardless of potential cohort size. The original foundation screens predate receipt wiring; the root-review follow-up below now exercises allowlisted model receipt reads with synthetic transport and no live model execution.

Automated checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cloudflare` on Node 22. The test suite includes known synthetic metric values, retries/source ordering, missing/conflicting/malformed records, oversize edit changes, independent resume clocks, user versus infrastructure outcomes, static-rule failures, unfinished runs, mixed revisions, repeats, stealth/availability rendering, default latest-only retention, future atomic summary retention and reset/deletion.

Review performed locally: traced every displayed metric to its definition/source; checked unique run IDs, static rules in first-submit success, source clock boundaries, no raw code/output in summaries, no public private-history path, stealth suppression, reset notification ordering and the storage-disclosure gate. No independent human review has been claimed. The draft PR remains for review; merging/deployment are not authorized.

Full metric/data-source inventory, limits and release decisions: [developer-profile.md](../developer-profile.md).

Follow-up proposal and unaffected longitudinal work: [minimal private-history options and exact owner decision](../eng-340-longitudinal-proposal.md). The same-task repeat-history reducer now has synthetic tests for exact revisions/conditions, windows, missing metrics, completed-repeat selection, conflicting summaries, and participant isolation. Its display is descriptive, with no fresh-task ability/growth claim; no new history source or retention is enabled.

[Longitudinal availability on mobile](longitudinal-mobile-availability.png) shows the specific missing-history requirement and descriptive window rules without a fabricated trend. Latest follow-up verification: **238 tests passed**, workspace typechecks passed; Cloudflare build includes the Next production build. No private-history endpoint, new permission, disclosure edit or retention flag was enabled.


Root review follow-up: generation/invalidation and real-reset integration tests cover overlapping reads, synchronous private-view clearing, obsolete success/failure and failed post-reset rereads. Browser verification held an old IndexedDB dump, invalidated the view, induced a failed reread and then released the old dump: neither private history nor model results returned. A held model response released after stealth similarly could not restore comparisons; no new request followed stealth. Ordinary refresh errors retain only a labelled stale snapshot.

The overview now shows personal observations with definitions/timelines and evidence-targeted actions, rather than a counts-only summary. Model display is wired to the fixed read-only D1/R2 receipt reader, with synthetic transport in browser demos and no real model calls. Unit tests verify allowlist/private-field exclusion, exact protocol/revision, reported identities/reasoning, distinct outcomes/read states and runtime/diagnostics mismatch withholding. User compile/runtime failure recovery is tested separately from infrastructure/unknown errors. The interpretation version is v2.


Updated root-review screens: [personal observations on desktop](review-overview-desktop.png), [personal observations on mobile](review-overview-mobile.png), [stored model reference on desktop](review-model-reference-desktop.png). All are synthetic. The fixture includes a reported model/version ID, reasoning high, one observed completion and submission count; no player data, raw model messages or model code appears.

Latest validation: **253 tests passed**, including actual reset→notification→failed-reread integration, stale generation rejection, pre-test user errors, unclassified/infrastructure separation, evidence-targeted topic recommendations, receipt source/protocol/identity verification, allowlist exclusion, bounded size and actual database/stream deadlines. Workspace typechecks passed. Browser checks additionally confirmed four visible personal observations and an untouched-topic action at 390px without horizontal overflow, synchronous DOM clearing with an old dump held, pending response rejection after stealth, and the actual API’s 403/404/no-store/unconfigured behavior. Populated model rendering used a mocked transport; deployed D1/R2 result coverage remains for environment validation, not a fabricated live result.

[Model reference on mobile](review-model-reference-mobile.png) confirms a matched synthetic observed outcome renders at 390px with no main-content overflow. Production/Cloudflare builds include the model-reader route; hosted CI is required again after pushing the review fixes.

## Option A implementation, 27 October

[Uploaded matched-repeat history on mobile](uploaded-repeat-history-mobile.png) and [desktop](uploaded-repeat-history-desktop.png) show **synthetic transport fixtures**, not live participant uploads or a live RPC/Basin read. The fixture pages contain five then three attempt summaries; four earlier and four recent completed repeats share one exact task revision/runtime/editor condition. The existing longitudinal reducer renders medians and supporting links. Local progress remains 1 completed / 1 unfinished; loading history does not write it back.

Interaction walkthrough:

1. The new legal version sends an older accepted test account through the existing acceptance screen. Accepting `2026-10-27.2` in the local fixture opens the dashboard. No live notice or collection change is deployed.
2. Open **Uploaded history / optional**, inspect UTC dates/limits, then **Load uploaded history**. No history request occurs on mount, focus or ordinary device refresh. Missing ownership secret explains disabled/not-yet-uploaded evidence and private-backup recovery, rather than pretending another challenge reconstructs old history.
3. The actual local route returns 503/unconfigured/no-store because the new service binding is absent; cross-origin requests return 403, malformed bodies 400, oversized bodies 413, GET 405. No credentials or production configuration were accessed. Populated presentation uses an explicit mocked history response only.
4. With the synthetic transport, load five summaries then the next three. Expand **Reflection / growth** and the four-earlier/four-recent group. Device progress is unchanged; main content fits 390px and 1440px. Standard details/buttons/date inputs retain keyboard focus and activation semantics.
5. Hold a history response; dispatch the same destructive boundary used by reset/deletion; inspect cleared DOM synchronously; release the old response. It cannot restore history. Focus still makes no uploaded read. Then fail a new explicit read: previous uploaded history stays absent and labelled device evidence remains. Unit tests independently cover an actual reset followed by a failing reread.

The exact least-privilege service binding, account-wide SQL-token caveat, query budgets, source inventory, lifetime/reset/delete/stealth behavior and release decisions are in [eng-340-private-history.md](../eng-340-private-history.md). No binding, token, persistent summary store, local history retention, merge or deployment is enabled. Live verification and security/disclosure review remain release gates.

Final option A local checks: **268 tests passed**, workspace typechecks passed; production/Cloudflare and ingest dry builds passed. Added explicit coverage for a deletion that coincides with a failed SQL read: deletion still takes precedence over the transient error. Missing completion for an over-budget attempt is reported as unavailable, never “unfinished.” Real `codemirror-6` fingerprints are preserved for matched history. Hosted CI and independent review are required on the pushed head.
