/**
 * At most one tiny model comparison for Stats, about one named solved attempt and the stored model
 * runs of that exact challenge revision with the same runtime and diagnostics setting. Each model
 * counts once: its first try at the provider-default reasoning, failures included, conflicting
 * duplicates dropped (`defaultComparisons`), never the best of several.
 *
 * These are observed runs, not a population: one matched run is said as that named model's result;
 * several are said with their actual count, solved of finished. With the player's own local code
 * length, the line gives code length (Unicode code points, whitespace included; length is not a
 * score); otherwise the outcome. One try per model is not a success rate. Submissions and time are
 * never compared: a person passes the examples before submitting and a model needn't, and editing
 * time isn't API latency.
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
export type RunOutcome = "solved" | "stopped" | "budget" | "refused" | "error";
/** One matched model's first default try. Code-free: a length at most. */
export interface ModelRun {
  model: string;
  outcome: RunOutcome;
  /** The solving code's length, when it solved and the length is recorded. */
  codeLength: number | null;
}
export interface ModelFyi {
  kind: "code-length" | "outcome";
  attempt: string;
  challenge: string;
  title: string;
  revision: string;
  /** Every matched finished run, by model id: the whole account, failures included. */
  runs: ModelRun[];
  solved: number;
  ran: number;
  /** code-length only: the player's passing code, in characters. */
  yours: number | null;
  /** code-length only: the one solving run's length, or the median of the solving runs' lengths. */
  modelLength: number | null;
  /** How many solving runs `modelLength` is drawn from. */
  lengthRuns: number;
  text: string;
}
export type ModelFyiReason =
  /** Not requested, or the viewer is in stealth or signed out. */
  | "off"
  /** No sound solved attempt on a current revision with one known setup. */
  | "no-attempt"
  | "loading"
  /** No stored model results could be read for the candidates. */
  | "unavailable"
  /** No finished model run with the same runtime and diagnostics setting. */
  | "unmatched";
export type ModelFyiResult =
  | { state: "shown"; fyi: ModelFyi }
  | { state: "omitted"; reason: ModelFyiReason };

const OUTCOME: Partial<Record<ModelReceipt["state"], RunOutcome>> = {
  completed: "solved",
  stopped: "stopped",
  budget: "budget",
  refused: "refused",
  error: "error",
};
const DID: Record<RunOutcome, string> = {
  solved: "solved it",
  stopped: "stopped without solving it",
  budget: "ran out of its budget without solving it",
  refused: "refused it",
  error: "ended with an error without solving it",
};

/** Which revisions to request and, for the local code-length read, which attempts; at most three. */
export function modelFyiCandidates(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
): { challenge: string; revision: string; attempt: string }[] {
  return fyiCandidates(attempts, catalog).map((c) => ({
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
  const candidates = fyiCandidates(attempts, catalog);
  if (!candidates.length) return omitted("no-attempt");
  let loading = false,
    read = false;
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
    // Queued, running, missing and incompatible runs never finished: not a failure, not counted.
    const runs: ModelRun[] = defaultComparisons(receipts)
      .flatMap((d) => {
        const r = d.receipt;
        const outcome = r && OUTCOME[r.state];
        if (!r || !outcome || receiptMatch(r, a.conditions) !== "matched") return [];
        const length =
          outcome === "solved" && Number.isSafeInteger(r.finalCodeLength) && r.finalCodeLength! > 0
            ? r.finalCodeLength
            : null;
        return [{ model: r.model, outcome, codeLength: length }];
      })
      .sort((x, y) => x.model.localeCompare(y.model));
    if (!runs.length) continue;
    const solved = runs.filter((r) => r.outcome === "solved").length;
    const lengths = runs.flatMap((r) => (r.codeLength === null ? [] : [r.codeLength]));
    const where = `${c.title} (current version, same runtime and diagnostics)`;
    const yours = localLengths[a.attempt];
    const own = Number.isSafeInteger(yours) && yours > 0 ? yours : null;
    const one = runs.length === 1 ? runs[0] : null;
    const codeLength = own !== null && lengths.length > 0;
    const modelLength = codeLength ? median(lengths) : null;
    let text: string;
    if (one)
      text = codeLength
        ? `On ${where}, your passing code was ${own} characters; ${one.model} solved it on its first try at its default setting with ${modelLength}. One observed run; length isn't a score.`
        : `On ${where}, ${one.model} ${DID[one.outcome]} on its first try at its default setting. One observed run, not a success rate.`;
    else {
      const account = `${solved} of ${runs.length} models solved it on their first try at their default setting`;
      text = codeLength
        ? `On ${where}, your passing code was ${own} characters; ${account}, ${
            lengths.length === 1
              ? `and the solving run's code was ${modelLength}`
              : `with a median of ${modelLength} across those ${lengths.length} solving runs`
          }. Length isn't a score.`
        : `On ${where}, ${account}. One try each, not a success rate.`;
    }
    return {
      state: "shown",
      fyi: {
        kind: codeLength ? "code-length" : "outcome",
        attempt: a.attempt,
        challenge: a.challenge,
        title: c.title,
        revision: a.revision,
        runs,
        solved,
        ran: runs.length,
        yours: codeLength ? own : null,
        modelLength,
        lengthRuns: codeLength ? lengths.length : 0,
        text,
      },
    };
  }
  return omitted(loading ? "loading" : read ? "unmatched" : "unavailable");
}
