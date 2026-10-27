/**
 * Human cohorts for the /stats report (ENG-374): how other people did on the exact same challenge
 * revision, under the same recorded runtime and diagnostics, as suppressed aggregates only.
 *
 * Policy approved by Ekku on 27 October 2026 (via dot): at least 20 eligible distinct browsers, same
 * revision and compatible conditions, first attempts apart from repeats, current stealth excluded,
 * under-18s never mixed with adults, no narrow slices or individual records. A conservative floor,
 * not a statistical guarantee. Still DISABLED: uploaded profiles are not authoritative current
 * privacy state. The disabled CONTROL fence is implemented; activation awaits independent review,
 * native Basin verification, scheduled snapshot integration and root's approval
 * (docs/human-cohorts.md). While COHORTS_ENABLED is false the route answers "disabled" without SQL.
 * Nothing here accepts a participant, demographic filter or SQL from a caller.
 */
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import { knownEditor } from "./cohort-conditions";
import { checkCohortWindow, type CohortWindow } from "./cohort-window";

export const COHORTS_ENABLED = false;
/** Approved policy: the smallest number of eligible distinct browsers behind any published figure. */
export const MIN_COHORT = 20;
/** Shares are published rounded to this step, to reduce precision; changes at rounding boundaries can still disclose membership. */
export const SHARE_STEP = 0.05;
export const COHORT_VERSION = "cohort-2";

export interface CohortGroup {
  /** The recorded runtime of every attempt in the group, exactly as uploaded. */
  runtime: Record<string, string>;
  /** Whether the editor showed type diagnostics. */
  diagnostics: boolean;
  /** Exact recorded editor name and feature set, including shortcut/tool changes. */
  editor: { name: string; features: string[] };
  /** Each browser's earliest first attempt, or its earliest repeat; never both in one group. */
  practice: "first" | "repeat";
  /** A band, never an exact count. */
  participants: "20–49" | "50–99" | "100–249" | "250+";
  /** Share of the group that finished, rounded to SHARE_STEP. */
  solved: number;
  /** Banded distinct-browser denominator for each published metric; null means withheld. */
  denominators: {
    solved: CohortGroup["participants"];
    firstTry: CohortGroup["participants"] | null;
    submissions: CohortGroup["participants"] | null;
  };
  /** Share whose first submission passed every check with no fired rule; null below MIN_COHORT submitters. */
  firstTry: number | null;
  /** Submissions needed by those who finished; null below MIN_COHORT finishers. */
  submissions: { p25: number; p50: number; p75: number } | null;
}
/**
 * Published eligibility requires current CONTROL state in addition to conservative uploaded
 * evidence. Client-ordered profiles cannot establish current privacy. The independent member
 * checks are in current-cohort.ts; the implemented disabled fence and live approval are described
 * in docs/eng-376-publication-contract.md.
 */
export const ELIGIBILITY = {
  unit: "distinct browsers, not people",
  ages: "adults only: browsers with server-acknowledged adult eligibility; 16–17 and unanswered are not counted",
  stealth:
    "current CONTROL eligibility must say non-stealth adult and no deletion tombstone; missing state is excluded, including past attempts",
  consent: "only records carrying an accepted Terms version",
  attempts:
    "one first attempt and, separately, one repeat per browser; a start without a recorded origin is not counted",
} as const;
/** Age bands counted as adults. 16–17 has no cohort of its own yet, so it stays unavailable, never mixed in. */
export const ADULT_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export interface CohortRead {
  /** earlier-version: cohorts cover each challenge's current revision only. */
  state: "disabled" | "ready" | "unavailable" | "earlier-version";
  version: typeof COHORT_VERSION;
  minimum: number;
  eligibility: typeof ELIGIBILITY;
  readAt: string;
  groups: CohortGroup[];
}

/**
 * One fixed SELECT for one validated revision. It returns value counts, never a participant:
 * (runtime, diagnostics, practice, completed, first_pass, submissions) → number of browsers.
 * Counted only: browsers whose latest uploaded profile states an adult band and not-stealth (so a
 * later uploaded stealth profile excludes past attempts within this window), with no conflicting
 * profile copies, person records with a Terms version and
 * no conflicting copies, attempts with one runtime and a start whose origin was recorded. Window functions and joins only: DataFusion could not plan
 * an IN subquery inside an aggregate (see the ENG-340 history fix).
 */
export function cohortQuery(
  challenge: string,
  revision: string,
  window: CohortWindow,
): string {
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("Cohorts need an exact challenge revision.");
  const w = checkCohortWindow(window);
  // First means first observed since this revision's publication. A sliding-window edge cannot
  // establish that: only explicit repeats / an earlier retained completion count in that case.
  const firstKnown = w.from === w.publication ? 1 : 0;
  return `WITH raw AS (
  SELECT * FROM default.events
  WHERE kind = 'observation' AND participant_id IS NOT NULL AND participant_id <> ''
    AND received_at >= '${w.from}' AND received_at < '${w.to}'
    AND occurred_at >= '${w.from}' AND occurred_at < '${w.to}'
    AND ((challenge = '${challenge}' AND challenge_revision = '${revision}') OR type = 'site.profile')
), record_groups AS (
  SELECT record_id, MAX(type) AS type, MAX(participant_id) AS participant_id,
    MAX(attempt_id) AS attempt_id, MAX(occurred_at) AS occurred_at, MAX(payload) AS payload,
    COUNT(DISTINCT payload) AS variants
  FROM raw GROUP BY record_id
), observations AS (
  SELECT * FROM record_groups WHERE variants = 1
), bad_profiles AS (
  SELECT DISTINCT r.participant_id FROM raw r JOIN record_groups g ON g.record_id = r.record_id
  WHERE r.type = 'site.profile' AND g.variants > 1
), profiles AS (
  SELECT participant_id, json_get_json(json_get_json(payload, 'data'), 'answers') AS answers,
    ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY occurred_at DESC, record_id DESC) AS latest
  FROM record_groups WHERE type = 'site.profile'
), eligible AS (
  SELECT p.participant_id FROM profiles p LEFT JOIN bad_profiles b ON b.participant_id = p.participant_id
  WHERE b.participant_id IS NULL AND p.latest = 1 AND json_get_json(p.answers, 'stealth') = 'false'
    AND json_get_str(p.answers, 'age') IN (${ADULT_BANDS.map((b) => `'${b}'`).join(", ")})
), bad_attempts AS (
  SELECT DISTINCT r.participant_id, r.attempt_id
  FROM raw r JOIN record_groups g ON g.record_id = r.record_id
  WHERE r.attempt_id IS NOT NULL AND (g.variants > 1 OR
    json_get_str(r.payload, 'captureVersion') NOT IN ('practice-capture-1.0.0', 'practice-capture-1.1.0', 'practice-capture-1.2.0') OR
    json_get_str(r.payload, 'captureVersion') IS NULL OR r.type='practice.capture-gap')
), practice AS (
  SELECT o.*, json_get_json(o.payload, 'data') AS data,
    json_get_str(json_get_json(o.payload, 'source'), 'id') AS source_id,
    CAST(json_get_json(json_get_json(o.payload, 'source'), 'sequence') AS BIGINT) AS sequence
  FROM observations o JOIN eligible e ON e.participant_id = o.participant_id
  LEFT JOIN bad_attempts b ON b.participant_id = o.participant_id AND b.attempt_id = o.attempt_id
  WHERE b.participant_id IS NULL AND o.attempt_id IS NOT NULL AND o.attempt_id <> ''
    AND json_get_str(o.payload, 'actor') = 'person'
    AND json_get_str(o.payload, 'termsVersion') IS NOT NULL AND json_get_str(o.payload, 'termsVersion') <> ''
), sources AS (
  SELECT participant_id, attempt_id, source_id, MIN(sequence) AS low, MAX(sequence) AS high,
    COUNT(DISTINCT sequence) AS positions, COUNT(*) AS records
  FROM practice GROUP BY participant_id, attempt_id, source_id
), source_quality AS (
  SELECT participant_id, attempt_id,
    MAX(CASE WHEN source_id IS NULL OR low <> 1 OR high <> positions OR records <> positions THEN 1 ELSE 0 END) AS bad
  FROM sources GROUP BY participant_id, attempt_id
), attempts AS (
  SELECT p.participant_id, p.attempt_id,
    MIN(CASE WHEN type = 'practice.started' THEN occurred_at END) AS started,
    COUNT(CASE WHEN type = 'practice.started' THEN 1 END) AS starts,
    MAX(CASE WHEN type = 'practice.started' AND json_get_str(data, 'from') = 'again' THEN 1 ELSE 0 END) AS again,
    MAX(CASE WHEN type = 'practice.started' AND json_get_str(data, 'from') IN ('direct','picker','quick-start','next','link','again') THEN 1 ELSE 0 END) AS known_start,
    COUNT(DISTINCT CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'runtime') END) AS runtimes,
    MAX(CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'runtime') END) AS runtime,
    COUNT(DISTINCT CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'editor') END) AS editors,
    MAX(CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'editor') END) AS editor,
    MAX(CASE WHEN type='practice.opened' AND (json_get_json(data,'runtime') IS NULL OR json_get_json(data,'editor') IS NULL) THEN 1 ELSE 0 END) AS unknown_conditions,
    MAX(CASE WHEN type = 'practice.opened' AND json_get_json(json_get_json(data, 'editor'), 'features') LIKE '%"type-diagnostics"%' THEN 1 ELSE 0 END) AS diagnostics
  FROM practice p JOIN source_quality q ON q.participant_id=p.participant_id AND q.attempt_id=p.attempt_id
  WHERE q.bad=0 GROUP BY p.participant_id, p.attempt_id
), submission_groups AS (
  SELECT participant_id, attempt_id, json_get_str(data, 'runId') AS run_id,
    MIN(occurred_at) AS submitted_at, MIN(source_id) AS source_id, MIN(sequence) AS sequence,
    MAX(data) AS data, COUNT(DISTINCT data) AS variants
  FROM practice WHERE type='practice.submitted' GROUP BY participant_id, attempt_id, json_get_str(data, 'runId')
), submission_times AS (
  SELECT participant_id,attempt_id,submitted_at,COUNT(DISTINCT source_id) AS sources
  FROM submission_groups GROUP BY participant_id,attempt_id,submitted_at
), submissions AS (
  SELECT g.*, t.sources,
    CASE WHEN variants=1 AND run_id IS NOT NULL AND run_id<>'' AND
      json_get_str(data, 'result') IN ('passed','failed') AND
      json_get_json(data, 'rules') LIKE '[%]' AND
      ((json_get_str(data,'result')='passed' AND json_get_json(data,'passed')=json_get_json(data,'total') AND json_get_json(data,'rules')='[]') OR
       (json_get_str(data,'result')='failed' AND (CAST(json_get_json(data,'passed') AS BIGINT)<CAST(json_get_json(data,'total') AS BIGINT) OR json_get_json(data,'rules')<>'[]'))) AND
      CAST(json_get_json(data, 'total') AS BIGINT)>0 AND
      json_get_json(data, 'total')=CAST(CAST(json_get_json(data, 'total') AS BIGINT) AS VARCHAR) AND
      json_get_json(data, 'passed')=CAST(CAST(json_get_json(data, 'passed') AS BIGINT) AS VARCHAR) AND
      CAST(json_get_json(data, 'passed') AS BIGINT) BETWEEN 0 AND CAST(json_get_json(data, 'total') AS BIGINT)
    THEN CASE WHEN json_get_str(data, 'result')='passed' AND json_get_json(data, 'rules')='[]' AND
      json_get_json(data, 'passed')=json_get_json(data, 'total') THEN 1 ELSE 0 END END AS passed,
    ROW_NUMBER() OVER (PARTITION BY g.participant_id,g.attempt_id ORDER BY g.submitted_at, source_id, sequence, run_id) AS nth
  FROM submission_groups g JOIN submission_times t ON t.participant_id=g.participant_id AND t.attempt_id=g.attempt_id AND t.submitted_at=g.submitted_at
), completions AS (
  SELECT s.participant_id,s.attempt_id,MIN(s.nth) AS solved_at
  FROM submissions s JOIN practice p ON p.participant_id=s.participant_id AND p.attempt_id=s.attempt_id
    AND p.type='practice.completed' AND json_get_str(p.data,'runId')=s.run_id
    AND p.occurred_at >= s.submitted_at
  WHERE s.passed=1 GROUP BY s.participant_id,s.attempt_id
), outcomes AS (
  SELECT a.*, CASE WHEN c.solved_at IS NOT NULL THEN 1 ELSE 0 END AS completed,
    MAX(CASE WHEN s.nth=1 THEN s.passed END) AS first_pass,
    COUNT(DISTINCT CASE WHEN s.run_id IS NOT NULL AND s.run_id<>'' AND (c.solved_at IS NULL OR s.nth<=c.solved_at) THEN s.run_id END) AS submissions,
    MAX(CASE WHEN s.nth IS NOT NULL AND (s.sources>1 OR s.variants<>1 OR s.run_id IS NULL OR s.run_id='') THEN 1 ELSE 0 END) AS bad_submissions
  FROM attempts a LEFT JOIN submissions s ON s.participant_id=a.participant_id AND s.attempt_id=a.attempt_id
  LEFT JOIN completions c ON c.participant_id=a.participant_id AND c.attempt_id=a.attempt_id
  GROUP BY a.participant_id,a.attempt_id,a.started,a.starts,a.again,a.known_start,a.runtimes,a.runtime,a.editors,a.editor,a.diagnostics,a.unknown_conditions,c.solved_at
), start_evidence AS (
  SELECT DISTINCT participant_id,attempt_id,occurred_at FROM raw WHERE type='practice.started'
), first_starts AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY occurred_at,attempt_id) AS start_number,
    COUNT(*) OVER (PARTITION BY participant_id,occurred_at) AS ties
  FROM start_evidence
), ranked AS (
  SELECT o.*, CASE WHEN f.attempt_id=o.attempt_id AND f.ties=1 THEN 1 ELSE 0 END AS earliest_start, ROW_NUMBER() OVER (PARTITION BY o.participant_id ORDER BY started, o.attempt_id) AS nth,
    MAX(completed) OVER (PARTITION BY o.participant_id ORDER BY started, o.attempt_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior_completion
  FROM outcomes o LEFT JOIN first_starts f ON f.participant_id=o.participant_id AND f.start_number=1
  WHERE started IS NOT NULL AND starts=1 AND known_start=1 AND runtimes=1 AND editors=1 AND unknown_conditions=0
), units AS (
  SELECT *, CASE WHEN again=1 OR prior_completion=1 THEN 'repeat'
    WHEN nth=1 AND earliest_start=1 AND ${firstKnown}=1 THEN 'first' ELSE 'unknown' END AS practice FROM ranked
), one_per_browser AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY participant_id, practice ORDER BY started, attempt_id) AS pick
  FROM units WHERE practice<>'unknown' AND bad_submissions=0
)
SELECT runtime, editor, diagnostics, practice, completed, first_pass, submissions, COUNT(*) AS browsers
FROM one_per_browser WHERE pick = 1
GROUP BY runtime, editor, diagnostics, practice, completed, first_pass, submissions
LIMIT 5001`;
}

type Row = {
  runtime: string | null;
  editor: string | null;
  diagnostics: number | string;
  practice: string;
  completed: number | string;
  first_pass: number | string | null;
  submissions: number | string;
  browsers: number | string;
};
const band = (n: number): CohortGroup["participants"] =>
  n >= 250 ? "250+" : n >= 100 ? "100–249" : n >= 50 ? "50–99" : "20–49";
const round = (share: number) => Math.round(share / SHARE_STEP) * SHARE_STEP;
/** Nearest-rank quantile over value counts. */
function quantile(counts: [number, number][], q: number) {
  const total = counts.reduce((n, [, c]) => n + c, 0);
  const rank = Math.max(1, Math.ceil(q * total));
  let seen = 0;
  for (const [value, c] of counts.sort((a, b) => a[0] - b[0])) {
    seen += c;
    if (seen >= rank) return value;
  }
  return counts.at(-1)![0];
}

/**
 * Every published figure rests on at least `minimum` distinct browsers. Groups are a fixed
 * partition (runtime × diagnostics × first/repeat) with no totals across them, so no published
 * figure supplies a cross-group total. Thresholds do not guarantee anonymity.
 */
export function cohortResult(
  rows: unknown,
  minimum = MIN_COHORT,
  readAt = new Date().toISOString(),
): CohortRead {
  if (!Array.isArray(rows) || rows.length > 5000)
    throw new Error("Cohort response exceeds its budget.");
  const groups = new Map<
    string,
    {
      runtime: Record<string, string>;
      editor: CohortGroup["editor"];
      diagnostics: boolean;
      practice: "first" | "repeat";
      rows: Row[];
    }
  >();
  if (minimum < MIN_COHORT || !Number.isInteger(minimum))
    throw new Error("Invalid cohort threshold.");
  for (const r of rows as Row[]) {
    if (
      !r ||
      [r.browsers, r.completed, r.diagnostics, r.submissions].some(
        (v) =>
          !(
            typeof v === "number" ||
            (typeof v === "string" && /^(0|[1-9][0-9]*)$/.test(v))
          ),
      ) ||
      (r.first_pass !== null &&
        !(
          r.first_pass === 0 ||
          r.first_pass === 1 ||
          r.first_pass === "0" ||
          r.first_pass === "1"
        )) ||
      !Number.isSafeInteger(Number(r.browsers)) ||
      Number(r.browsers) < 1 ||
      ![0, 1].includes(Number(r.completed)) ||
      ![0, 1].includes(Number(r.diagnostics)) ||
      !(r.first_pass === null || [0, 1].includes(Number(r.first_pass))) ||
      !Number.isSafeInteger(Number(r.submissions)) ||
      Number(r.submissions) < 0
    )
      throw new Error("Invalid cohort values.");
    if (
      !r ||
      (r.practice !== "first" && r.practice !== "repeat") ||
      typeof r.runtime !== "string"
    )
      continue;
    let runtime: Record<string, string>;
    try {
      const parsed = JSON.parse(r.runtime);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        continue;
      if (
        !Object.values(parsed).every(
          (v) => typeof v === "string" && v.length <= 128,
        )
      )
        continue;
      runtime = Object.fromEntries(
        Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b)),
      ) as Record<string, string>;
    } catch {
      continue;
    }
    let editor: CohortGroup["editor"];
    try {
      const e = knownEditor(JSON.parse(r.editor ?? "null"));
      if (!e) continue;
      editor = e;
    } catch {
      continue;
    }
    const diagnostics = Number(r.diagnostics) === 1;
    if (diagnostics !== editor.features.includes("type-diagnostics"))
      throw new Error("Inconsistent diagnostic conditions.");
    const key = JSON.stringify([runtime, editor, diagnostics, r.practice]);
    const g = groups.get(key) ?? {
      runtime,
      editor,
      diagnostics,
      practice: r.practice,
      rows: [],
    };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out: CohortGroup[] = [];
  for (const g of groups.values()) {
    const count = (f: (r: Row) => boolean) =>
      g.rows.filter(f).reduce((n, r) => n + Number(r.browsers), 0);
    const n = count(() => true);
    if (n < minimum) continue;
    const solved = count((r) => Number(r.completed) === 1);
    const submitters = count(
      (r) => r.first_pass !== null && Number(r.submissions) > 0,
    );
    const passed = count(
      (r) => Number(r.first_pass) === 1 && Number(r.submissions) > 0,
    );
    const finishers = g.rows
      .filter((r) => Number(r.completed) === 1 && Number(r.submissions) > 0)
      .map(
        (r) => [Number(r.submissions), Number(r.browsers)] as [number, number],
      );
    const finished = finishers.reduce((m, [, c]) => m + c, 0);
    out.push({
      runtime: g.runtime,
      editor: g.editor,
      denominators: {
        solved: band(n),
        firstTry: submitters >= minimum ? band(submitters) : null,
        submissions: finished >= minimum ? band(finished) : null,
      },
      diagnostics: g.diagnostics,
      practice: g.practice,
      participants: band(n),
      solved: round(solved / n),
      firstTry: submitters >= minimum ? round(passed / submitters) : null,
      submissions:
        finished >= minimum
          ? {
              p25: quantile(finishers, 0.25),
              p50: quantile(finishers, 0.5),
              p75: quantile(finishers, 0.75),
            }
          : null,
    });
  }
  return {
    state: "ready",
    version: COHORT_VERSION,
    minimum,
    eligibility: ELIGIBILITY,
    readAt,
    groups: out,
  };
}

/** The group matching one attempt's recorded conditions, or null: never a nearest or pooled stand-in. */
export function matchingGroup(
  read: CohortRead,
  conditions: readonly string[],
  practice: "first" | "repeat",
  viewerAge: "adult" | "non-adult" | "unknown",
): CohortGroup | null {
  if (viewerAge !== "adult") return null;
  const runtimes = conditions.filter((c) => c.startsWith("Runtime: "));
  const editors = conditions.filter((c) => c.startsWith("Editor: "));
  if (runtimes.length !== 1 || editors.length !== 1) return null;
  let runtime: Record<string, unknown>;
  try {
    runtime = JSON.parse(runtimes[0].slice(9));
  } catch {
    return null;
  }
  const key = JSON.stringify(
    Object.entries(runtime).sort(([a], [b]) => a.localeCompare(b)),
  );
  const diagnostics = (editors[0].split("; features: ")[1] ?? "")
    .split(", ")
    .includes("type-diagnostics");
  return (
    read.groups.find(
      (g) =>
        g.practice === practice &&
        g.diagnostics === diagnostics &&
        g.editor.name === editors[0].slice(8).split("; features: ")[0] &&
        JSON.stringify(g.editor.features) ===
          JSON.stringify(
            (editors[0].split("; features: ")[1] ?? "")
              .split(", ")
              .filter(Boolean)
              .sort(),
          ) &&
        JSON.stringify(Object.entries(g.runtime)) === key,
    ) ?? null
  );
}
