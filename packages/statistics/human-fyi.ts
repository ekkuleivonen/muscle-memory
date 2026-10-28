/**
 * At most one tiny human comparison for Stats: the share of scored first submissions that passed,
 * among other browsers' first attempts at one exact challenge revision with the same runtime and
 * editor setup. It names that challenge, is never set against the player's own figures (those
 * count differently), and is omitted, never stood in for, whenever anything is missing. ENG-394
 * wires it into the report; this module only decides what may be said.
 */
import type { AttemptSummary } from "../developer-profile/derive";
import {
  ADULT_BANDS,
  COHORTS_ENABLED,
  COHORT_VERSION,
  MIN_COHORT,
  matchingGroup,
  type CohortGroup,
  type CohortRead,
} from "./cohort";
import { fyiCandidates, type CatalogEntry } from "./fyi-candidates";

/**
 * One `/api/cohort/<challenge>/<revision>` read, bound to the pair that was requested: a bare
 * CohortRead carries no challenge or revision, so it can't prove which attempt it describes.
 */
export interface HumanCohortRead {
  challenge: string;
  revision: string;
  read: CohortRead | "loading" | "unavailable";
}
export interface HumanFyi {
  attempt: string;
  challenge: string;
  title: string;
  revision: string;
  practice: "first";
  /** Canonical runtime JSON of the matched group. */
  runtime: string;
  metric: "scored-first-submission-pass-share";
  /** 0–1 in the published 5% steps. */
  share: number;
  /** Distinct browsers behind this metric (its own denominator), not verified people. */
  browsers: CohortGroup["participants"];
  text: string;
}
export type HumanFyiReason =
  /** Switched off, not requested, or the viewer is in stealth or signed out. */
  | "off"
  /** Comparisons are adults-only and the viewer's age is unanswered: an optional answer helps. */
  | "age-missing"
  /** The viewer answered 16–17: no adult comparison, and no prompt. */
  | "not-adult"
  /** No solved first attempt on a current revision with one known setup. */
  | "no-attempt"
  | "loading"
  /** No usable read: missing, expired or invalidated summary, or a failed request. */
  | "unavailable"
  /** A valid read, but no exactly matching group with at least 20 browsers behind the metric. */
  | "too-few";
/** A link Stats may offer beside an omitted line; fixed routes only. */
export interface FyiAction {
  label: string;
  href: string;
}
export type HumanFyiResult =
  | { state: "shown"; fyi: HumanFyi }
  | { state: "omitted"; reason: HumanFyiReason; action: FyiAction | null };

/** The fixed settings route that lets a viewer add the optional age answer, returning to Stats. */
export const AGE_FORM = "/settings/profile/age?from=stats-comparisons";
/** Where the server-confirmed comparison settings are shown and can be applied. */
export const PRIVACY_SETTINGS = "/settings/privacy";
/** Only for an unanswered age. Never offered to someone who answered 16–17. */
export const AGE_ACTION: FyiAction = { label: "Add your age band (optional)", href: AGE_FORM };
/**
 * For an adult whose line is unavailable or too few. Stats can't know the server's record from
 * this device, so the action is neutral: it never says settings are unconfirmed or unshared.
 */
export const REVIEW_ACTION: FyiAction = { label: "Review comparison settings", href: PRIVACY_SETTINGS };
const ACTION: Partial<Record<HumanFyiReason, FyiAction>> = {
  "age-missing": AGE_ACTION,
  unavailable: REVIEW_ACTION,
  "too-few": REVIEW_ACTION,
};

type Viewer = { age?: string; stealth?: boolean; signedOut?: boolean } | null;

/** Which revisions to request, newest first; never more than three. */
export function humanFyiCandidates(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
): { challenge: string; revision: string }[] {
  return fyiCandidates(attempts, catalog, ["first"]).map((c) => ({
    challenge: c.attempt.challenge,
    revision: c.attempt.revision,
  }));
}

const omitted = (reason: HumanFyiReason): HumanFyiResult => ({
  state: "omitted",
  reason,
  action: ACTION[reason] ?? null,
});

export function humanFyi(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
  viewer: Viewer,
  reads: readonly HumanCohortRead[] | undefined,
  /** The build's switch; tests pass true to exercise the enabled path. */
  enabled: boolean = COHORTS_ENABLED,
): HumanFyiResult {
  if (!enabled || !reads || !viewer || viewer.stealth || viewer.signedOut)
    return omitted("off");
  if (viewer.age === "16-17") return omitted("not-adult");
  if (!(ADULT_BANDS as readonly string[]).includes(viewer.age ?? ""))
    return omitted("age-missing");
  const candidates = fyiCandidates(attempts, catalog, ["first"]);
  if (!candidates.length) return omitted("no-attempt");
  let loading = false,
    valid = false;
  for (const c of candidates) {
    const a = c.attempt;
    const bound = reads.filter((r) => r.challenge === a.challenge && r.revision === a.revision);
    // Two different answers for one revision can't both be current: say nothing.
    if (bound.length !== 1) continue;
    const read = bound[0].read;
    if (read === "loading") {
      loading = true;
      continue;
    }
    if (
      read === "unavailable" ||
      read.state !== "ready" ||
      read.version !== COHORT_VERSION ||
      read.minimum !== MIN_COHORT ||
      !Array.isArray(read.groups)
    )
      continue;
    valid = true;
    const group = matchingGroup(read, a.conditions, "first", "adult");
    if (
      !group ||
      group.firstTry === null ||
      !Number.isFinite(group.firstTry) ||
      group.firstTry < 0 ||
      group.firstTry > 1 ||
      group.denominators.firstTry === null
    )
      continue;
    const percent = Math.round(group.firstTry * 100);
    return {
      state: "shown",
      fyi: {
        attempt: a.attempt,
        challenge: a.challenge,
        title: c.title,
        revision: a.revision,
        practice: "first",
        runtime: c.runtime,
        metric: "scored-first-submission-pass-share",
        share: group.firstTry,
        browsers: group.denominators.firstTry,
        text: `On ${c.title} (current version, same runtime and editor setup), about ${percent}% of scored first submissions passed, across first attempts from ${group.denominators.firstTry} browsers.`,
      },
    };
  }
  return omitted(loading ? "loading" : valid ? "too-few" : "unavailable");
}
