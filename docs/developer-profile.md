# Observed developer profile (ENG-340)

`/stats` is a private, device-local dashboard behind the existing Terms gate. It uses the terminal typography, coverage bars, native expandable sections and links to the existing challenge picker and optional profile settings. After completion, practice links to comparison availability without delaying or changing the local verdict.

The overview has four observations: challenge progress, retained evidence coverage, observed repeats, and comparison availability. Language and attempt filters apply to descriptive metrics. Progress remains challenge-based; a previously completed challenge can also have an unfinished repeat. Unexplored is never failure. Metadata coverage describes the current catalog, not global ability or the metadata of an older revision.

## Evidence and definitions

`packages/developer-profile/registry.ts` is the definition and threshold registry. `developer-profile-1` is an interpretation version, independent of capture. Every metric needs at least one eligible attempt/revision. There is no threshold to unlock a rank or percentile. Counts are per attempt; the overview of a metric is the median across eligible attempts, except first-submit success, which shows numerator/denominator. These medians describe the selected task mix; they do not establish growth. Repeats can be filtered separately; without an explicit repeat start or an earlier retained completion, first/repeat status remains unknown.

The pure reader deduplicates on stored `recordId` (the server's `record_id`), then orders each source by sequence. It uses the original per-key timestamps, never the batch delivery time. Wall clock orders separate sources approximately; it never subtracts independent monotonic clocks. Missing positions, explicit capture gaps, conflicting IDs, non-monotonic clocks, unsupported capture versions and missing starts withhold derived values for that attempt. Missing values are `null`, never fabricated zeroes. No retained trace can establish that an unseen closing tail was recorded.

| Inventory | Source and implementation | Eligibility / limitation |
| --- | --- | --- |
| Completed, unfinished, unexplored | Existing device progress + current catalog | Completion count survives earlier raw compaction; previous completion does not imply the live revision was completed. |
| Language, topic, difficulty coverage | Actual catalog language, tags and difficulty | Topic counts overlap; all bars are completed / catalog challenges in that slice. |
| First versus repeat | `started.from=again` or earlier retained completion of same key | Otherwise unknown, not assumed fresh. |
| First edit / run latency | `started` → first edit / queued run | Same source only, contiguous supported trace. |
| Runs, examples, submissions | Distinct run IDs with purpose | Queued/running/terminal are phases of one run, not three runs. Incomplete runs count as observed starts. |
| First-submit success | First submitted verdict + matching decided terminal run | Positive test total and passed/failed verdict; success also requires no fired static rules. Infrastructure, cancellation, timeout and undecided cases excluded. |
| Passing-test progression | Submitted passed/total + static-rule count in timeline | Examples progression withheld: requires evaluation against exact revision cases. No raw output or hidden inputs displayed. |
| Between-run time and edits | Terminal run → next queue in same source | Median interval and count of edit transactions. Excludes runner wait. |
| Runner wait | Queued → terminal for each run | Missing, duplicate or cross-source terminal makes total unavailable. |
| Improvement and recovery | Decided failed submission → increased pass count with same test total | Counts adjacent same-source improvements, including clearing fired static rules with all cases passing; time, distinct check iterations and edits measured to improvement in the same source. No inference from infrastructure failures. |
| Returns to unresolved work | Open after closed in same unfinished attempt | Does not infer why someone left or returned. |
| Failure signatures | Explicit unavailable state | Needs deterministic safe classifier; never group or display arbitrary exception text. |
| Inserted/deleted volume | CodeMirror change-set JSON | UTF-16 units, multiline newlines included. Oversize/truncated/malformed changes withhold volume and size distribution. |
| Undo, paste | Explicit edit userEvent | No claim of typo, waste, cheating or AI use. |
| Edit-size distribution | Inserted + deleted units per transaction | Small ≤20 units; larger >20 units. These are descriptive sizes, not patches/rewrite intent. |
| Retention, patches, rewrites | Explicit unavailable state | Needs validated diff algorithm and complete snapshots; not inferred from deletion volume. |
| Meaningful checkpoints | Run statuses, submissions, completion, snapshot reasons | Latest 200 checkpoint labels per attempt. No snapshot code retained in summaries. |
| Editor key bursts, pauses, within-burst timing | Original non-repeat editor keydown timestamps | ≤2 seconds joins a burst, longer gaps count as pauses; no attention/confusion interpretation. Median within-burst interval. |
| Correction/navigation keys | Non-repeat keydowns | Backspace/Delete; arrows/Home/End/PageUp/PageDown. Not mistakes. |
| Interaction-active estimate | Keydowns, edits, selections in source | Sum adjacent gaps ≤30 seconds; isolated events add zero. An estimate, not attention/thinking time. May overlap runner wait. |
| Session span | First/last monotonic observations per source | Includes pauses and runner wait; excludes time between page resumes. Not total completion elapsed time. |
| Focus, visibility | Focus losses / hidden transitions | Not distraction or activity outside the app. |
| Assistance context | Hover openings and diagnostics shown; optional profile link | Exposure is not necessarily requested help. No recorded help does not establish no external AI. |
| Difficulty, confidence, would-use-AI | Latest optional answer per completed attempt | Retrospective, successful-completer-only; no prediction/calibration/overconfidence claim. |
| Growth/consistency | Explicit unavailable state | Needs enough matched fresh tasks, exact revision/language/runtime/tools and repeats separate. No easier-task-mix skill claim. |
| Humans | Suppressed, including for hypothetical large cohorts | No approved minimum cohort threshold or released eligible aggregate. Suggested numbers in legal docs are proposals, not authorization. More comparable participants required; demographics from one person cannot fix this. |
| Models | Unavailable; no participant-facing receipt API yet | Needs exact model/version, reasoning, protocol, revision/runtime/tools and slot status allowlist. One try is an observed outcome, not a probability. Missing/stopped/budget/refused/infrastructure failures must remain distinct. Latency is not a human race. |

## Local history and privacy

**Release gate:** `PROFILE_HISTORY_ENABLED = false`. The current Privacy Notice promises latest-attempt-only local storage; ENG-340 does not change consent or that promise. The dashboard uses the latest raw attempts retained on this device. The tested summary path is implemented for a subsequent approved disclosure/version change, but the uploader does not enable it.

When enabled, before compaction removes an older uploaded attempt, the existing IndexedDB transaction saves its code-free interpretation in `settings[developer-profile-summaries]`. An attempt with any queued observation stays whole until it can be summarized atomically. The latest attempt's raw evidence remains available as before. If summary derivation/storage fails, the transaction aborts without deleting raw evidence. Summaries include the interpretation version, private attempt identity/revision, counts, conditions, optional retrospective answers and at most 200 timeline labels. They contain no code, raw keys, test outputs or reference solutions and are never uploaded.

The reader combines these summaries with current local records, with current records taking precedence. History compacted before this feature is not recoverable here. Changing interpretation versions invalidates old summaries; absent raw evidence is not silently reinterpreted. This deliberate local summary path avoids adding an ID-based private server reader, credentials or a new service. Existing CF ingestion, query infrastructure and erasure remain untouched.

Existing backup export/import carries summaries in the store settings. Reset clears them with observations while keeping the device proof so uploaded data stays deletable. Account deletion clears the identity and summaries too. Reset change notifications occur after the clear, so open dashboards cannot refresh before deletion finishes. No server derived store or public response is added, so existing server erasure needs no new propagation target.

Stealth keeps own private stats available, hides all human/model comparison details and makes no comparison requests. Future aggregate release still must exclude stealth participants, including historical data, enforce approved minimum counts across combined slices, and keep 16–17-year-olds separate or excluded. None of that is bypassed by this dashboard.

No event, question, consent, runtime tooling or model call is added. Local historical retention remains off until disclosure approval. Profile context uses existing editable/skippable settings, coordinated with ENG-333/356–367 by linking rather than creating a new prompt mechanism. No age nudge, demographics gate or promised percentile.

## Next requirements and owner decisions

- Ekku/legal: approve minimum cohort size and small/sensitive/intersected slice policy, including separate handling of 16–17-year-olds. Until then all human aggregates stay suppressed, even if a large dataset exists.
- ENG-342: implement and validate an allowlisted participant-facing model receipt reader, compatible runtime/tool conditions and exact model identity. Do not expose the operator ledger or model event payloads. Cache receipts independently of local completion feedback; there is currently no comparison fetch/cache and therefore no stale benchmark fallback.
- Ekku/legal must approve a storage disclosure and legal version before enabling local summary retention. Alternatively, a complete older private history would require a separately scoped participant-secret-authorized CF read/aggregate path. Browser IDs are not authentication. Playing more cannot repair already compacted history.
- Validate snapshot diffs, safe failure classification and matched longitudinal inference before enabling those explicitly unavailable metrics. New question/event collection is a separate proposal.

No changes restore private challenge sources removed by ENG-371/PR65. Existing benchmark ledger and erasure work are preserved. No new credentials, privileges, paid model runs, deployment or merge.

## Verification and interaction walkthrough

Run `npm test`, `npm run typecheck`, `npm run build` and `npm run build:cloudflare` with Node 22. Pure synthetic traces exercise exact known values, record retry/order, gaps/conflicts, oversized changes, incomplete runs, infrastructure states, independent resume clocks, mixed revisions, repeats, compaction, backup and reset/deletion. The fixtures have no participant code or reference solutions.

Open `/stats` after accepting Terms. Read the overview, filter a language or observed repeats, expand a section, then a metric to see its definition and eligible/missing attempts. Follow its attempt link to the checkpoint timeline. Coverage links open the existing challenge practice. Optional context opens the existing settings form. All summaries, filters, buttons and links support keyboard focus; Enter/Space toggles summaries. On a narrow screen metrics stack and coverage labels wrap. Refresh reads local evidence; a read error retains and labels the previous view stale. Stealth removes comparison details while retaining own evidence. After completion, the comparison availability link leaves the immediate local verdict intact.
