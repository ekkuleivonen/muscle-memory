/** Aggregate-only handoff to the separately owned private hourly cache. No persistence/scheduler. */
import { knownEditor, runtimeKey } from "./cohort-conditions";
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import {
  COHORT_VERSION,
  ELIGIBILITY,
  MIN_COHORT,
  type CohortRead,
  type CohortGroup,
} from "./cohort";
import { checkCohortWindow, type CohortWindow } from "./cohort-window";
import { currentCohort, type EligibilityChecker } from "./current-cohort";
export const HUMAN_SNAPSHOT_VERSION = "human-snapshot-1";
export const HUMAN_SNAPSHOT_TTL_MS = 60 * 60 * 1000;
export interface ComparisonControl extends EligibilityChecker {
  generation(): Promise<string | null>;
  authorize(generation: string): Promise<boolean>;
}
export interface HumanSnapshot {
  version: typeof HUMAN_SNAPSHOT_VERSION;
  challenge: string;
  revision: string;
  window: CohortWindow;
  computedAt: string;
  expiresAt: string;
  generation: string;
  groups: CohortGroup[];
}
const token = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
/** Call only from a trusted fixed-query builder; IDs remain transient inside currentCohort. */
export async function buildHumanSnapshot(
  spec: {
    challenge: string;
    revision: string;
    window: CohortWindow;
    runtime: Record<string, string>;
  },
  query: () => Promise<unknown>,
  control: ComparisonControl,
  now = new Date(),
): Promise<HumanSnapshot | null> {
  const { challenge, revision, window, runtime } = spec;
  if (!runtimeKey(runtime)) throw new Error("Invalid expected runtime.");
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("Invalid snapshot revision.");
  const bounded = checkCohortWindow(window);
  const generation = await control.generation();
  if (!token(generation)) return null;
  const result = await currentCohort(async () => {
    const raw = await query();
    if (!Array.isArray(raw) || raw.length > 1000)
      throw new Error("Comparison budget exceeded.");
    return raw.filter((row) => {
      try {
        return runtimeKey(JSON.parse(row.runtime)) === runtimeKey(runtime);
      } catch {
        return false;
      }
    });
  }, control);
  if ((await control.generation()) !== generation) return null;
  return {
    version: HUMAN_SNAPSHOT_VERSION,
    challenge,
    revision,
    window: bounded,
    computedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HUMAN_SNAPSHOT_TTL_MS).toISOString(),
    generation,
    groups: result.groups,
  };
}
/** Project, never spread an artifact into a public response. Invalid/missing/expired means no FYI. */
export async function serveHumanSnapshot(
  raw: unknown,
  spec: {
    challenge: string;
    revision: string;
    runtime: Record<string, string>;
  },
  control: Pick<ComparisonControl, "authorize">,
  now = new Date(),
): Promise<CohortRead | null> {
  try {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as HumanSnapshot;
    const { challenge, revision, runtime } = spec;
    if (!runtimeKey(runtime)) return null;
    if (
      s.version !== HUMAN_SNAPSHOT_VERSION ||
      s.challenge !== challenge ||
      s.revision !== revision ||
      !CHALLENGE_KEY.test(challenge) ||
      !REVISION.test(revision) ||
      !token(s.generation)
    )
      return null;
    const window = checkCohortWindow(s.window);
    const computed = Date.parse(s.computedAt),
      expires = Date.parse(s.expiresAt);
    if (
      !Number.isFinite(computed) ||
      !Number.isFinite(expires) ||
      computed > now.getTime() ||
      expires <= now.getTime() ||
      expires - computed !== HUMAN_SNAPSHOT_TTL_MS ||
      Date.parse(window.to) > computed
    )
      return null;
    if (!Array.isArray(s.groups) || s.groups.length > 200) return null;
    const bands = ["20–49", "50–99", "100–249", "250+"];
    const groups: CohortGroup[] = [];
    for (const g of s.groups) {
      if (
        !g ||
        runtimeKey(g.runtime) !== runtimeKey(runtime) ||
        !knownEditor(g.editor) ||
        !bands.includes(g.participants) ||
        !g.runtime ||
        Array.isArray(g.runtime) ||
        Object.keys(g.runtime).length > 32 ||
        !Object.values(g.runtime).every(
          (v) => typeof v === "string" && v.length <= 128,
        ) ||
        typeof g.diagnostics !== "boolean" ||
        !["first", "repeat"].includes(g.practice) ||
        !g.editor ||
        typeof g.editor.name !== "string" ||
        !/^[A-Za-z0-9-]{1,64}$/.test(g.editor.name) ||
        !Array.isArray(g.editor.features) ||
        g.editor.features.length > 64 ||
        !g.editor.features.every(
          (v) => typeof v === "string" && /^[a-z0-9-]{1,80}$/.test(v),
        ) ||
        new Set(g.editor.features).size !== g.editor.features.length ||
        g.diagnostics !== g.editor.features.includes("type-diagnostics") ||
        typeof g.solved !== "number" ||
        !Number.isFinite(g.solved) ||
        g.solved < 0 ||
        g.solved > 1 ||
        !(
          g.firstTry === null ||
          (typeof g.firstTry === "number" &&
            Number.isFinite(g.firstTry) &&
            g.firstTry >= 0 &&
            g.firstTry <= 1)
        ) ||
        !g.denominators ||
        g.denominators.solved !== g.participants ||
        (g.firstTry === null
          ? g.denominators.firstTry !== null
          : !bands.includes(g.denominators.firstTry!)) ||
        (g.submissions === null
          ? g.denominators.submissions !== null
          : !bands.includes(g.denominators.submissions!))
      )
        return null;
      if (
        g.submissions &&
        (![g.submissions.p25, g.submissions.p50, g.submissions.p75].every(
          (v) => Number.isSafeInteger(v) && v >= 1,
        ) ||
          g.submissions.p25 > g.submissions.p50 ||
          g.submissions.p50 > g.submissions.p75)
      )
        return null;
      groups.push({
        runtime: Object.fromEntries(Object.entries(g.runtime)),
        editor: { name: g.editor.name, features: [...g.editor.features] },
        diagnostics: g.diagnostics,
        practice: g.practice,
        participants: g.participants,
        solved: g.solved,
        firstTry: g.firstTry,
        denominators: {
          solved: g.denominators.solved,
          firstTry: g.denominators.firstTry,
          submissions: g.denominators.submissions,
        },
        submissions: g.submissions
          ? {
              p25: g.submissions.p25,
              p50: g.submissions.p50,
              p75: g.submissions.p75,
            }
          : null,
      });
    }
    if (!(await control.authorize(s.generation))) return null;
    return {
      state: "ready",
      version: COHORT_VERSION,
      minimum: MIN_COHORT,
      eligibility: ELIGIBILITY,
      readAt: s.computedAt,
      groups,
    };
  } catch {
    return null;
  }
}
