/**
 * At most one tiny model comparison for Stats, about one named solved attempt and the stored model
 * runs of that exact challenge revision with the same runtime and diagnostics setting. Models are
 * taken one result each (first try at the provider-default reasoning, failures included,
 * conflicting duplicates dropped: `defaultComparisons`), never the best of several.
 *
 * Preferably code length: the player's passing code against the median of models that solved it,
 * in Unicode code points including whitespace, said neutrally (length is not a score). Without
 * the player's own local code length, the models' outcome on the task instead. One try per model
 * is an observation, not a success rate. Submissions and time are never compared: a person passes
 * the examples before submitting and a model needn't, and editing time isn't API latency.
 */
import type { AttemptSummary } from "../developer-profile/derive";
import { fyiCandidates, type CatalogEntry } from "../statistics/fyi-candidates";
import { defaultComparisons } from "./comparison";
import { receiptMatch, type ModelReceipt } from "./receipts";

/** One `/api/model-receipts/<challenge>/<revision>` read, bound to the pair that was requested. */
export interface ModelReceiptsRead {
  challenge: string;
  revision: string;
  receipts: readonly ModelReceipt[] | "loading" | "unavailable";
}
interface Named {
  attempt: string;
  challenge: string;
  title: string;
  revision: string;
  text: string;
}
export type ModelFyi =
  | (Named & {
      kind: "code-length";
      /** The player's passing code, in characters (code points, whitespace included). */
      yours: number;
      modelMedian: number;
      /** Matched models that solved it, each counted once. */
      models: number;
    })
  | (Named & {
      kind: "outcome";
      solved: number;
      /** Matched models whose run finished (solved, stopped, budget, refused or error). */
      ran: number;
    });
export type ModelFyiReason =
  /** Not requested, or the viewer is in stealth or signed out. */
  | "off"
  /** No solved attempt on a current revision with one known setup. */
  | "no-attempt"
  | "loading"
  /** No stored model results could be read for the candidates. */
  | "unavailable"
  /** Results exist, but none ran with the same runtime and diagnostics setting. */
  | "unmatched"
  /** Fewer than three matched models to describe. */
  | "too-few";
export type ModelFyiResult =
  | { state: "shown"; fyi: ModelFyi }
  | { state: "omitted"; reason: ModelFyiReason };

/** Fewer models than this would describe one or two runs, not a pattern. */
export const MIN_MODELS = 3;
const FINISHED: readonly ModelReceipt["state"][] = ["completed", "stopped", "budget", "refused", "error"];

/** Which revisions to request and, for the local code-length read, which attempts; at most three. */
export function modelFyiCandidates(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
): { challenge: string; revision: string; attempt: string }[] {
  return fyiCandidates(attempts, catalog, ["first", "repeat"]).map((c) => ({
    challenge: c.attempt.challenge,
    revision: c.attempt.revision,
    attempt: c.attempt.attempt,
  }));
}

const omitted = (reason: ModelFyiReason): ModelFyiResult => ({ state: "omitted", reason });
const median = (ns: number[]) => {
  const s = [...ns].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
};

export function modelFyi(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
  viewer: { stealth?: boolean; signedOut?: boolean } | null,
  reads: readonly ModelReceiptsRead[] | undefined,
  /** Attempt → its passing code's length, from `PracticeStore.solvedCodeLengths`; numbers only. */
  localLengths: Readonly<Record<string, number>> = {},
): ModelFyiResult {
  if (!reads || !viewer || viewer.stealth || viewer.signedOut) return omitted("off");
  const candidates = fyiCandidates(attempts, catalog, ["first", "repeat"]);
  if (!candidates.length) return omitted("no-attempt");
  let loading = false,
    read = false,
    matchedAny = false;
  for (const c of candidates) {
    const a = c.attempt;
    const bound = reads.filter((r) => r.challenge === a.challenge && r.revision === a.revision);
    if (bound.length !== 1) continue;
    const receipts = bound[0].receipts;
    if (receipts === "loading") {
      loading = true;
      continue;
    }
    if (receipts === "unavailable" || !Array.isArray(receipts)) continue;
    read = true;
    const matched = defaultComparisons(receipts)
      .map((d) => d.receipt)
      .filter(
        (r): r is ModelReceipt =>
          r !== null && receiptMatch(r, a.conditions) === "matched",
      );
    if (matched.length) matchedAny = true;
    const named = {
      attempt: a.attempt,
      challenge: a.challenge,
      title: c.title,
      revision: a.revision,
    };
    const where = `${c.title} (current version, same runtime and diagnostics)`;
    const yours = localLengths[a.attempt];
    const lengths = matched
      .filter((r) => r.state === "completed")
      .map((r) => r.finalCodeLength)
      .filter((n): n is number => Number.isSafeInteger(n) && n! > 0);
    if (Number.isSafeInteger(yours) && yours > 0 && lengths.length >= MIN_MODELS) {
      const m = median(lengths);
      return {
        state: "shown",
        fyi: {
          ...named,
          kind: "code-length",
          yours,
          modelMedian: m,
          models: lengths.length,
          text: `On ${where}, your passing code was ${yours} characters; the ${lengths.length} models that solved it at their default setting wrote a median of ${m}. Counts include whitespace; length isn't a score.`,
        },
      };
    }
    const finished = matched.filter((r) => FINISHED.includes(r.state));
    if (finished.length >= MIN_MODELS) {
      const solved = finished.filter((r) => r.state === "completed").length;
      return {
        state: "shown",
        fyi: {
          ...named,
          kind: "outcome",
          solved,
          ran: finished.length,
          text: `On ${where}, ${solved} of ${finished.length} models solved it on their first try at their default setting. One try each, not a success rate.`,
        },
      };
    }
  }
  return omitted(loading ? "loading" : !read ? "unavailable" : matchedAny ? "too-few" : "unmatched");
}
