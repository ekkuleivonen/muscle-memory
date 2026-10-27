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
- No comparison requests, cached benchmark fallback or live model runs occur. Human figures remain suppressed regardless of potential cohort size; model receipts are unavailable until the compatible allowlisted reader exists.

Automated checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cloudflare` on Node 22. The test suite includes known synthetic metric values, retries/source ordering, missing/conflicting/malformed records, oversize edit changes, independent resume clocks, user versus infrastructure outcomes, static-rule failures, unfinished runs, mixed revisions, repeats, stealth/availability rendering, default latest-only retention, future atomic summary retention and reset/deletion.

Review performed locally: traced every displayed metric to its definition/source; checked unique run IDs, static rules in first-submit success, source clock boundaries, no raw code/output in summaries, no public private-history path, stealth suppression, reset notification ordering and the storage-disclosure gate. No independent human review has been claimed. The draft PR remains for review; merging/deployment are not authorized.

Full metric/data-source inventory, limits and release decisions: [developer-profile.md](../developer-profile.md).
