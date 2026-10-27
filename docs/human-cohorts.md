# Human comparisons — disabled ENG-376 draft

Ekku approved the policy on 27 October 2026 via dot: at least **20 eligible distinct browser participants**, exact challenge/test revision and language/runtime, compatible tools/diagnostics, first attempts separated from repeats, current stealth/deletion exclusions, known adults only, no narrow demographic slices or individual records. Browser IDs are not verified people. Thresholds/rounding reduce disclosure risk but do not guarantee anonymity.

`COHORTS_ENABLED=false`. The public `GET /api/cohort/<key>/<revision>` route remains Terms-gated and validates the registered revision, but performs **no SQL** and serves no human comparisons. It has no participant, demographic, SQL or date-filter parameter. Even flipping the read flag alone leaves the route unavailable until the separately reviewed private snapshot reader is installed. Earlier registered revisions are not pooled with the current revision. Synthetic-QA revisions never become public human cohorts.

## Current privacy and publication

The [implemented privacy draft](eng-376-current-privacy.md) and [exact publication/RPC/control proposal](eng-376-publication-contract.md) supersede PR71's client-profile/epoch/cache suggestion. Original-secret-authorized comparison settings are stored minimally in existing CONTROL, independently of telemetry. Missing, provisional, unknown-age, non-adult, stealth or tombstoned state is ineligible. Newer conflicting uploaded profiles fail closed; an earlier adult/non-stealth answer is not resurrected. Uploaded profiles are only an additional conservative filter, never current-privacy authority.

The requester approved the authorization-point contract for draft implementation: after acknowledgement, a new publication cannot use the prior generation. Both permissive and restrictive settings changes and deletion advance a conditional CONTROL generation before success. Partial writes remain pending; deletion keeps its proof until invalidation completes. Authorization is a conditional R2 put that cannot replace a concurrent invalidation. It does not retract a response authorized earlier and delivered later, or already downloaded aggregates.

Both browser transport and ingest authority remain disabled/unconfigured. No new live service binding, variable, credentials, scheduler or legal version is installed. Existing `ParticipantOwner.verify` authority is unchanged. The separate `ComparisonEligibility` entrypoint is not available to public HTTP or the approved ownership binding. No ID/proof/raw record/SQL method is exposed publicly.

## Private hourly interface and safe results

`precomputeCohort()` and `buildHumanSnapshot(spec, query, control)` expose a disabled fixed-query builder seam for the separately owned scheduler. The private artifact is aggregate-only: `{version,challenge,revision,window,computedAt,expiresAt,generation,groups}`. Member IDs exist only transiently inside trusted build code and are not cached as eligibility authority. Web's existing server-only `ADMIN_STATS_SQL_TOKEN` is reused; no arbitrary caller SQL or new credential is added.

`serveHumanSnapshot(raw, spec, control)` verifies the key/version/runtime/window/one-hour expiry, projects allowlisted aggregate fields and conditionally authorizes the same generation. Missing, expired, malformed, changed-generation or CONTROL failure omits the FYI with no stale fallback. Privacy validity is checked on every serve, independently of precomputation cadence. The cache owner handles persistence, triggers, cost review and serving integration. This PR adds none of that machinery and does not edit the separate model-cache implementation.

Each `cohort-2` result group matches exact runtime and editor feature set/diagnostics, with first/repeat kept apart. It contains only:

- `participants`: a band, 20–49 / 50–99 / 100–249 / 250+;
- `solved`: share with a recorded matching successful submission/completion, rounded to 5%; this is observed completion, not an eventual success probability;
- `firstTry`: rounded pass share among valid first submitted decided-test verdicts, null below 20 such browser participants; errored/cancelled/unknown results are unavailable, not zeroes;
- `submissions`: measured nearest-rank p25/p50/p75 distinct submitted run IDs up to the first solve, null below 20 validated finishers;
- `denominators`: separate bands for the completion, first-verdict and finisher subsets, null when that metric is suppressed.

There are no totals across different tool/first/repeat groups. Differences at rounding boundaries may still reveal membership. Unknown external assistance cannot be inferred from editor tooling.

## Query evidence and bounds

Only a registered current revision's server-selected window is scanned: at most 90 days, no earlier than its immutable registry publication time, with both received and occurred timestamps bounded. An ambiguous first attempt at a truncated window edge is withheld. First means first **observed since this revision's registry publication**, not verified lifetime-first practice. Repeats need explicit `again` or an earlier retained completion. One browser contributes at most one selected first and one selected repeat.

Supported capture, Terms-bearing person records, contiguous per-source positions, unique starts and a single exact runtime/editor condition are required. Conflicts, explicit capture gaps, unknown conditions, malformed run evidence and ambiguous cross-source same-time ordering withhold attempts. Duplicate run IDs are counted once; post-solve submissions do not inflate submissions-to-solve. Delayed/incomplete capture still limits this observational evidence.

SQL has a 15-second fetch/body timeout, 1 MiB streamed response budget and 1,001-row overflow sentinel (1,000 usable maximum); at most 100 unique members enter CONTROL checks. Two uncached checks cost at most 600 CONTROL reads during a build. Runtime projection matches trusted pinned language metadata; arbitrary telemetry strings cannot be published as runtime labels. Final serving uses bounded conditional generation authorization only, with no global event scan. Three CAS attempts bound contention; failures suppress rather than grant authority.

Internal candidate computation permits at most two active queries and one query per revision per minute per isolate, with at most 128 recent keys. These limits are **per isolate, not a global spending cap**. A cadence/trigger budget is owned by the scheduled-cache review, not hidden in page loads.

## Verification and activation gates

Synthetic Node/SQLite tests cover threshold and per-metric 20→19 suppression, stale tabs, provisional/finalized controls, deletion/stealth/age ordering, partial mutation recovery, lost acknowledgements, identity boundaries, conflicting profiles, exact revisions/tools, window edges, gaps, post-solve counting and secret/code/identifier projection boundaries. Deterministic CAS interleavings prove that acknowledged invalidations cannot be overwritten by old-generation authorization. A separate small reference model enumerates the proposed linearization contract; it is not network-delivery proof.

The native local Workers tests cover actual R2 conditional-put behavior, RPC method isolation, original-secret enforcement and tombstones. DataFusion 50.1.0 and SQLite execute both aggregate/member queries using synthetic JSON stand-ins; they do **not** verify Basin's native JSON functions. Native bounded synthetic execution is coordinated by the requester before activation; no participant dumps or secret extraction are needed.

Remaining gates: independent review; native Basin evidence; separately reviewed scheduled artifact persistence/serving; final disclosure review and exact live control/RPC/trigger approval; explicit merge/deployment instruction. Human comparisons stay disabled throughout this draft.
