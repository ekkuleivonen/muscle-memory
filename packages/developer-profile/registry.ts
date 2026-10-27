/** Interpretation version, independent of capture. v2 adds pre-test user-error recovery
 * and separate infrastructure/unclassified failure categories; old summaries are not reinterpreted. */
export const METRIC_VERSION = "developer-profile-2";
/** Release gate: current Privacy Notice promises latest-attempt-only storage.
 * Enable only with approved retention disclosure/legal version; no consent change in ENG-340. */
export const PROFILE_HISTORY_ENABLED = false;
export const SUMMARY_KEY = "developer-profile-summaries";
export const SMALL_EDIT_UNITS = 20;
export const BURST_GAP_MS = 2000;
export const ACTIVE_GAP_MS = 30000;
export const SECTIONS = [
  "Solving / testing",
  "Editing / rhythm",
  "Recovery / return",
  "Reflection / growth",
] as const;
type Section = (typeof SECTIONS)[number];
const metric = (
  section: Section,
  label: string,
  definition: string,
  unit = "count",
) => ({
  section,
  label,
  definition,
  unit,
  minimum: "One eligible retained attempt; no population inference.",
  baseline: "Your own recorded attempt only.",
});
export const METRICS = {
  firstEdit: metric(
    SECTIONS[0],
    "First edit",
    "Monotonic time from started to the first edit in the same source. Resumed or missing starts are ineligible.",
    "ms",
  ),
  firstRun: metric(
    SECTIONS[0],
    "First run",
    "Monotonic time from started to the first queued run in the same source.",
    "ms",
  ),
  runs: metric(
    SECTIONS[0],
    "Distinct runs",
    "Unique run IDs, including incomplete runs; phases are never counted as separate runs.",
  ),
  examples: metric(
    SECTIONS[0],
    "Example checks",
    "Distinct run IDs with purpose examples.",
  ),
  submissions: metric(
    SECTIONS[0],
    "Submission checks",
    "Distinct run IDs with purpose submit, including cancelled checks.",
  ),
  firstSubmit: metric(
    SECTIONS[0],
    "First-submit success",
    "1 when the first submission passed every case with no fired static rules, 0 when it failed or fired rules. A genuine pre-test user error is unsuccessful; infrastructure failures, timeout, cancellation and unclassified errors are ineligible.",
    "boolean",
  ),
  betweenRuns: metric(
    SECTIONS[0],
    "Between checks",
    "Median terminal-to-next-queue time within one source. Runner wait is excluded.",
    "ms",
  ),
  editsBetweenRuns: metric(
    SECTIONS[0],
    "Edits between checks",
    "Median edit transactions between a terminal run and the next queue within one source.",
  ),
  runnerWait: metric(
    SECTIONS[0],
    "Runner wait",
    "Sum of queued-to-terminal intervals within each source. Unfinished or conflicting runs make this unavailable.",
    "ms",
  ),
  edits: metric(
    SECTIONS[1],
    "Edit transactions",
    "Recorded document-changing transactions, not keystrokes.",
  ),
  inserted: metric(
    SECTIONS[1],
    "Inserted characters",
    "UTF-16 code units inserted in CodeMirror change sets. Oversize or malformed changes make volume unavailable.",
  ),
  deleted: metric(
    SECTIONS[1],
    "Deleted characters",
    "UTF-16 code units removed in change sets. Deletion does not identify a typo.",
  ),
  smallEdits: metric(
    SECTIONS[1],
    "Small edits",
    "Transactions inserting plus deleting at most 20 UTF-16 units; a size category, not a quality judgment.",
  ),
  largeEdits: metric(
    SECTIONS[1],
    "Larger edits",
    "Transactions inserting plus deleting more than 20 UTF-16 units. This does not identify waste or intent.",
  ),
  undo: metric(
    SECTIONS[1],
    "Undo actions",
    "Edit userEvent undo or undo.*; redo is not undo.",
  ),
  paste: metric(
    SECTIONS[1],
    "Explicit paste actions",
    "Edit userEvent input.paste or input.paste.*. Paste is not evidence of cheating or AI use.",
  ),
  bursts: metric(
    SECTIONS[1],
    "Editor key bursts",
    "Groups of non-repeat editor keydowns separated by at most 2 seconds, within each source. Pauses do not establish thinking or confusion.",
  ),
  keyInterval: metric(
    SECTIONS[1],
    "Within-burst key interval",
    "Median interval between non-repeat keydowns within a burst; original per-key timestamps are used.",
    "ms",
  ),
  pauses: metric(
    SECTIONS[1],
    "Between-burst pauses",
    "Intervals over 2 seconds between non-repeat keydowns in one source; page exits are not measured pauses.",
  ),
  corrections: metric(
    SECTIONS[1],
    "Correction keys",
    "Backspace and Delete keydowns, excluding auto-repeat. These do not establish mistakes.",
  ),
  navigation: metric(
    SECTIONS[1],
    "Navigation keys",
    "Arrow, Home, End, PageUp and PageDown keydowns excluding auto-repeat.",
  ),
  active: metric(
    SECTIONS[1],
    "Interaction-active estimate",
    "Sum of gaps at most 30 seconds between editor keydowns, edits and selections, within a source. Zero-duration single events add no time. Not attention or thinking time; can overlap runner wait.",
    "ms",
  ),
  blur: metric(
    SECTIONS[1],
    "Editor focus losses",
    "Recorded practice.focus false observations. Blur does not establish distraction.",
  ),
  hidden: metric(
    SECTIONS[1],
    "Page hidden",
    "Transitions to hidden in practice.page, not activity in another application.",
  ),
  hover: metric(
    SECTIONS[1],
    "Type tooltips opened",
    "Recorded hover assistance exposures via keyboard or pointer. No recorded help does not rule out external AI.",
  ),
  diagnostics: metric(
    SECTIONS[1],
    "Diagnostic exposures",
    "Recorded diagnostics shown by the editor, not necessarily requested help.",
  ),
  recoveries: metric(
    SECTIONS[2],
    "User-check improvements",
    "Same-source submission improvements: a genuine pre-test user compile/runtime failure reaches decided tests, or decided tests gain passes / clear fired rules with all cases passing. Runner/loading failures, cancellations and timeouts are separate.",
  ),
  userErrors: metric(
    SECTIONS[2],
    "User code errors",
    "Distinct terminal user-error run IDs. Includes compile/runtime failures before tests and errors raised during tests; never runner failures, cancellations or timeouts.",
  ),
  userErrorRecoveries: metric(
    SECTIONS[2],
    "User errors reaching tests",
    "Distinct pre-test user-error runs followed by a later run reaching the test phase in the same source and purpose. Reaching tests is not necessarily completion; observed failure-to-test transitions only.",
  ),
  unclassifiedErrors: metric(
    SECTIONS[2],
    "Unclassified submission errors",
    "Errored submissions whose recorded terminal evidence cannot distinguish a pre-test user error from infrastructure or an unknown phase. Their recovery is unavailable, never silently counted as no recovery.",
  ),
  runnerErrors: metric(
    SECTIONS[2],
    "Runner failures",
    "Distinct terminal runner-error runs; these are infrastructure failures, not mistakes in the submitted code.",
  ),
  loadingFailures: metric(
    SECTIONS[2],
    "Runtime loading failures",
    "Recorded runtime unavailable observations, kept separate from user code errors.",
  ),
  timeouts: metric(
    SECTIONS[2],
    "Timed-out checks",
    "Distinct terminal timeout run IDs; cause is not inferred and these are excluded from user-error recovery.",
  ),
  cancellations: metric(
    SECTIONS[2],
    "Cancelled checks",
    "Distinct terminal cancelled run IDs, excluded from user-error recovery.",
  ),
  recoveryEdits: metric(
    SECTIONS[2],
    "Edits before improvement",
    "Edit transactions between the first user-failed submission (pre-test user error, failed tests or fired static rules) and a later improved submission in the same source.",
  ),
  recoveryChecks: metric(
    SECTIONS[2],
    "Checks before improvement",
    "Distinct queued run IDs between the first user-failed submission (pre-test user error, failed tests or fired static rules) and a later improvement in the same source, including the improving check.",
  ),
  recoveryTime: metric(
    SECTIONS[2],
    "Time before improvement",
    "Monotonic time between first user-failed submission (pre-test user error, failed tests or fired static rules) and a later improved submission in the same source.",
    "ms",
  ),
  returns: metric(
    SECTIONS[2],
    "Returns to unfinished work",
    "Opened observations after a previous closed observation within the same unresolved attempt. Does not infer the reason for leaving.",
  ),
  elapsed: metric(
    SECTIONS[3],
    "Recorded session span",
    "Sum of first-to-last monotonic observation spans by source; includes wait and pauses, excludes time between page resumes. Not total wall-clock completion time.",
    "ms",
  ),
} as const;
export type MetricId = keyof typeof METRICS;
export type Values = Record<MetricId, number | null>;
export const GATED = [
  [
    "Solving / testing",
    "Example passing progression",
    "Needs deterministic case evaluation against the exact retained revision; raw JSON output alone is not a pass count. Submission progression is shown in the timeline.",
  ],
  [
    "Editing / rhythm",
    "Retained code / patches versus rewrites",
    "Needs a validated snapshot-diff definition and complete untruncated snapshots. Edit sizes are available; they do not establish rewrite intent.",
  ],
  [
    "Recovery / return",
    "Recurring failure signatures",
    "Needs a safe deterministic classifier against exact revisions. Error text can contain code or hidden inputs and is not displayed or grouped.",
  ],
  [
    "Reflection / growth",
    "Matched growth and consistency",
    "Needs enough fresh tasks matched by revision, language/runtime and tools, with repeats separate. An easier task mix cannot show increased skill.",
  ],
] as const;

/** Descriptive own-history windows, never a human cohort or an ability threshold. */
export const REPEAT_WINDOW_DAYS = 28;
export const REPEAT_MIN_ATTEMPTS = 2;
export const REPEAT_METRICS = [
  "elapsed",
  "submissions",
  "inserted",
  "deleted",
] as const satisfies readonly MetricId[];
