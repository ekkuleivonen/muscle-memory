/**
 * Human cohorts for the /stats report (ENG-374): how other people did on the exact same challenge
 * revision, under the same recorded runtime and diagnostics, as suppressed aggregates only.
 *
 * Policy approved by Ekku on 27 October 2026 (via dot): at least 20 eligible distinct browsers, same
 * revision and compatible conditions, first attempts apart from repeats, current stealth excluded,
 * under-18s never mixed with adults, no narrow slices or individual records. A conservative floor,
 * not a statistical guarantee. Still DISABLED: uploaded profiles are not authoritative current
 * privacy state, so activation awaits the CONTROL-backed fix and root's approval
 * (docs/human-cohorts.md). While COHORTS_ENABLED is false the route answers "disabled" without SQL.
 * Nothing here accepts a participant, demographic filter or SQL from a caller.
 */
import { CHALLENGE_KEY, REVISION } from "../domain/records";

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
  /** Each browser's earliest first attempt, or its earliest repeat; never both in one group. */
  practice: "first" | "repeat";
  /** A band, never an exact count. */
  participants: "20–49" | "50–99" | "100–249" | "250+";
  /** Share of the group that finished, rounded to SHARE_STEP. */
  solved: number;
  /** Share whose first submission passed every check with no fired rule; null below MIN_COHORT submitters. */
  firstTry: number | null;
  /** Submissions needed by those who finished; null below MIN_COHORT finishers. */
  submissions: { p25: number; p50: number; p75: number } | null;
}
/**
 * Who is counted, stated with every read. Eligibility is positive: a browser counts only when its
 * latest uploaded profile states an adult band and says it is not stealth. Unknown is never adult,
 * never non-stealth. That latest profile is applied to all of its history, but it is not
 * authoritative: uploads can lag without bound and its order is client time. Must stay disabled
 * until the CONTROL-backed eligibility check in docs/human-cohorts.md replaces it.
 */
export const ELIGIBILITY = {
  unit: "distinct browsers, not people",
  ages: "adults only: browsers with server-acknowledged adult eligibility; 16–17 and unanswered are not counted",
  stealth: "current CONTROL eligibility must say non-stealth adult and no deletion tombstone; missing state is excluded, including past attempts",
  consent: "only records carrying an accepted Terms version",
  attempts: "one first attempt and, separately, one repeat per browser; a start without a recorded origin is not counted",
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
 * later stealth or deletion removes every past attempt) and none of whose profiles has conflicting
 * copies, person records with a Terms version and
 * no conflicting copies, attempts with one runtime and a start whose origin was recorded. Window functions and joins only: DataFusion could not plan
 * an IN subquery inside an aggregate (see the ENG-340 history fix).
 */
export function cohortQuery(challenge: string, revision: string): string {
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("Cohorts need an exact challenge revision.");
  return `WITH record_groups AS (
  SELECT record_id, MAX(type) AS type, MAX(participant_id) AS participant_id,
    MAX(attempt_id) AS attempt_id, MAX(occurred_at) AS occurred_at, MAX(payload) AS payload,
    COUNT(DISTINCT payload) AS variants
  FROM default.events
  WHERE kind = 'observation' AND participant_id IS NOT NULL AND participant_id <> ''
    AND ((challenge = '${challenge}' AND challenge_revision = '${revision}') OR type = 'site.profile')
  GROUP BY record_id
), observations AS (
  SELECT * FROM record_groups WHERE variants = 1
), profiles AS (
  SELECT participant_id, variants, json_get_json(json_get_json(payload, 'data'), 'answers') AS answers,
    ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY occurred_at DESC, record_id DESC) AS latest
  FROM record_groups WHERE type = 'site.profile'
), conflicted AS (
  -- Fail closed: a profile with conflicting copies could be a newer stealth or minor answer, so
  -- its browser is excluded rather than falling back to an older eligible profile.
  SELECT DISTINCT participant_id FROM profiles WHERE variants > 1
), eligible AS (
  SELECT p.participant_id FROM profiles p LEFT JOIN conflicted c ON c.participant_id = p.participant_id
  WHERE c.participant_id IS NULL AND p.latest = 1 AND json_get_json(p.answers, 'stealth') = 'false'
    AND json_get_str(p.answers, 'age') IN (${ADULT_BANDS.map((b) => `'${b}'`).join(", ")})
), practice AS (
  SELECT o.*, json_get_json(o.payload, 'data') AS data
  FROM observations o JOIN eligible e ON e.participant_id = o.participant_id
  WHERE o.attempt_id IS NOT NULL AND o.attempt_id <> ''
    AND json_get_str(o.payload, 'actor') = 'person'
    AND json_get_str(o.payload, 'termsVersion') IS NOT NULL AND json_get_str(o.payload, 'termsVersion') <> ''
    AND o.type IN ('practice.started', 'practice.opened', 'practice.submitted', 'practice.completed')
), attempts AS (
  SELECT participant_id, attempt_id,
    MIN(CASE WHEN type = 'practice.started' THEN occurred_at END) AS started,
    MAX(CASE WHEN type = 'practice.started' AND json_get_str(data, 'from') = 'again' THEN 1 ELSE 0 END) AS again,
    MAX(CASE WHEN type = 'practice.started' AND json_get_str(data, 'from') IS NOT NULL THEN 1 ELSE 0 END) AS known_start,
    MAX(CASE WHEN type = 'practice.completed' THEN 1 ELSE 0 END) AS completed,
    COUNT(DISTINCT CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'runtime') END) AS runtimes,
    MAX(CASE WHEN type = 'practice.opened' THEN json_get_json(data, 'runtime') END) AS runtime,
    MAX(CASE WHEN type = 'practice.opened' AND json_get_json(json_get_json(data, 'editor'), 'features') LIKE '%"type-diagnostics"%' THEN 1 ELSE 0 END) AS diagnostics,
    COUNT(DISTINCT CASE WHEN type = 'practice.submitted' THEN json_get_str(data, 'runId') END) AS submissions,
    MIN(CASE WHEN type = 'practice.submitted' THEN occurred_at END) AS first_submit
  FROM practice GROUP BY participant_id, attempt_id
), first_results AS (
  SELECT a.participant_id, a.attempt_id,
    MAX(CASE WHEN json_get_str(p.data, 'result') = 'passed' AND json_get_json(p.data, 'rules') = '[]' THEN 1 ELSE 0 END) AS first_pass
  FROM attempts a JOIN practice p ON p.participant_id = a.participant_id AND p.attempt_id = a.attempt_id
    AND p.type = 'practice.submitted' AND p.occurred_at = a.first_submit
  GROUP BY a.participant_id, a.attempt_id
), ranked AS (
  SELECT a.*, f.first_pass,
    ROW_NUMBER() OVER (PARTITION BY a.participant_id ORDER BY a.started, a.attempt_id) AS nth
  FROM attempts a LEFT JOIN first_results f ON f.participant_id = a.participant_id AND f.attempt_id = a.attempt_id
  WHERE a.started IS NOT NULL AND a.known_start = 1 AND a.runtimes = 1
), units AS (
  SELECT *, CASE WHEN nth = 1 AND again = 0 THEN 'first' ELSE 'repeat' END AS practice FROM ranked
), one_per_browser AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY participant_id, practice ORDER BY started, attempt_id) AS pick FROM units
)
SELECT runtime, diagnostics, practice, completed, first_pass, submissions, COUNT(*) AS browsers
FROM one_per_browser WHERE pick = 1
GROUP BY runtime, diagnostics, practice, completed, first_pass, submissions
LIMIT 5001`;
}

type Row = {
  runtime: string | null;
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
 * figure can be subtracted from another to isolate a smaller group.
 */
export function cohortResult(rows: unknown, minimum = MIN_COHORT, readAt = new Date().toISOString()): CohortRead {
  if (!Array.isArray(rows) || rows.length > 5000) throw new Error("Cohort response exceeds its budget.");
  const groups = new Map<string, { runtime: Record<string, string>; diagnostics: boolean; practice: "first" | "repeat"; rows: Row[] }>();
  for (const r of rows as Row[]) {
    if (!r || !Number.isSafeInteger(Number(r.browsers)) || Number(r.browsers) < 1 ||
      ![0, 1].includes(Number(r.completed)) || ![0, 1].includes(Number(r.diagnostics)) ||
      !(r.first_pass === null || [0, 1].includes(Number(r.first_pass))) ||
      !Number.isSafeInteger(Number(r.submissions)) || Number(r.submissions) < 0)
      throw new Error("Invalid cohort values.");
    if (!r || (r.practice !== "first" && r.practice !== "repeat") || typeof r.runtime !== "string") continue;
    let runtime: Record<string, string>;
    try {
      const parsed = JSON.parse(r.runtime);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") continue;
      if (!Object.values(parsed).every((v) => typeof v === "string" && v.length <= 128)) continue;
      runtime = Object.fromEntries(Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b))) as Record<string, string>;
    } catch {
      continue;
    }
    const diagnostics = Number(r.diagnostics) === 1;
    const key = JSON.stringify([runtime, diagnostics, r.practice]);
    const g = groups.get(key) ?? { runtime, diagnostics, practice: r.practice, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out: CohortGroup[] = [];
  for (const g of groups.values()) {
    const count = (f: (r: Row) => boolean) => g.rows.filter(f).reduce((n, r) => n + Number(r.browsers), 0);
    const n = count(() => true);
    if (n < minimum) continue;
    const solved = count((r) => Number(r.completed) === 1);
    const submitters = count((r) => r.first_pass !== null && Number(r.submissions) > 0);
    const passed = count((r) => Number(r.first_pass) === 1 && Number(r.submissions) > 0);
    const finishers = g.rows
      .filter((r) => Number(r.completed) === 1 && Number(r.submissions) > 0)
      .map((r) => [Number(r.submissions), Number(r.browsers)] as [number, number]);
    const finished = finishers.reduce((m, [, c]) => m + c, 0);
    out.push({
      runtime: g.runtime,
      diagnostics: g.diagnostics,
      practice: g.practice,
      participants: band(n),
      solved: round(solved / n),
      firstTry: submitters >= minimum ? round(passed / submitters) : null,
      submissions:
        finished >= minimum
          ? { p25: quantile(finishers, 0.25), p50: quantile(finishers, 0.5), p75: quantile(finishers, 0.75) }
          : null,
    });
  }
  return { state: "ready", version: COHORT_VERSION, minimum, eligibility: ELIGIBILITY, readAt, groups: out };
}

/** The group matching one attempt's recorded conditions, or null: never a nearest or pooled stand-in. */
export function matchingGroup(
  read: CohortRead,
  conditions: readonly string[],
  practice: "first" | "repeat",
): CohortGroup | null {
  const runtimes = conditions.filter((c) => c.startsWith("Runtime: "));
  const editors = conditions.filter((c) => c.startsWith("Editor: "));
  if (runtimes.length !== 1 || editors.length !== 1) return null;
  let runtime: Record<string, unknown>;
  try {
    runtime = JSON.parse(runtimes[0].slice(9));
  } catch {
    return null;
  }
  const key = JSON.stringify(Object.entries(runtime).sort(([a], [b]) => a.localeCompare(b)));
  const diagnostics = (editors[0].split("; features: ")[1] ?? "").split(", ").includes("type-diagnostics");
  return (
    read.groups.find(
      (g) =>
        g.practice === practice &&
        g.diagnostics === diagnostics &&
        JSON.stringify(Object.entries(g.runtime)) === key,
    ) ?? null
  );
}
