/**
 * The Stats comparison bridge (ENG-394, contract in docs/comparison-fyi.md): which reads to ask
 * for, and the reads bound to the exact challenge revision that asked, handed to ENG-376's
 * `humanFyi` and `modelFyi`. What may be said, every threshold and every eligibility rule live in
 * those helpers; this module only wires them. Both lines are off by default.
 */
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import { humanFyi, humanFyiCandidates, type HumanFyiResult } from "../../../../packages/statistics/human-fyi";
import { COHORTS_ENABLED, type CohortRead } from "../../../../packages/statistics/cohort";
import { modelFyi, modelFyiCandidates, type ModelFyiResult } from "../../../../packages/model-runs/stats-fyi";
import type { CatalogEntry } from "../../../../packages/statistics/fyi-candidates";
import type { ReceiptState } from "../../lib/report";
import type { StoredProfile } from "../../lib/profile";

/** One challenge revision, as `challenge/revision`: the key every comparison read is stored and bound under. */
export type Pair = { challenge: string; revision: string };
export const pairKey = (p: Pair) => `${p.challenge}/${p.revision}`;
/**
 * The comparison reads the report asks for (ENG-394 bridge): cohort summaries and model receipts
 * per exact challenge revision, and this device's passing-code lengths (numbers only) for the
 * model line's attempts. Empty lists request nothing.
 */
export interface ComparisonRequests {
  cohorts: readonly Pair[];
  receipts: readonly Pair[];
  lengths: readonly (Pair & { attempt: string })[];
}
export const NO_COMPARISONS: ComparisonRequests = { cohorts: [], receipts: [], lengths: [] };

/**
 * The model line's switch, off until its release is decided (ENG-376 owns integration and
 * activation). Human lines follow the cohort build switch, `COHORTS_ENABLED`.
 */
export const MODEL_FYI_ENABLED = false;

/**
 * A development build may preview both lines against synthetic replies (the browser check serves
 * them), with `NEXT_PUBLIC_STATS_COMPARISON_PREVIEW=1`. Never in a production build: the check is
 * on NODE_ENV first, so it compiles away there.
 */
export function comparisonPreview(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_STATS_COMPARISON_PREVIEW === "1";
}
const humanOn = () => COHORTS_ENABLED || comparisonPreview();
const modelOn = () => MODEL_FYI_ENABLED || comparisonPreview();

/** What to read for these attempts: nothing at all for a line that's off. */
export function comparisonRequests(attempts: readonly AttemptSummary[], catalog: readonly CatalogEntry[]): ComparisonRequests {
  if (!humanOn() && !modelOn()) return NO_COMPARISONS;
  const model = modelOn() ? modelFyiCandidates(attempts, catalog) : [];
  // One read per challenge revision, however many attempts share it (two solves of one challenge
  // would otherwise bind the same read twice, which the helper rightly refuses); lengths stay per attempt.
  const once = <T extends Pair>(pairs: readonly T[]) =>
    [...new Map(pairs.map((p) => [pairKey(p), { challenge: p.challenge, revision: p.revision }])).values()];
  return {
    cohorts: humanOn() ? once(humanFyiCandidates(attempts, catalog)) : [],
    receipts: once(model),
    lengths: model,
  };
}

export interface Comparisons {
  human: HumanFyiResult;
  model: ModelFyiResult;
}

/**
 * Each requested pair's read, bound to that pair (missing means still loading), passed to the
 * helpers with this device's viewer. A line that's off passes no reads, which the helpers call off.
 */
export function comparisons(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
  stored: StoredProfile | null,
  requests: ComparisonRequests,
  read: {
    cohorts: Record<string, CohortRead | "unavailable">;
    receipts: Record<string, ReceiptState>;
    lengths: Record<string, number>;
  },
): Comparisons {
  const viewer = stored ? { age: stored.profile.age, stealth: stored.stealth, signedOut: stored.signedOut } : null;
  const human = humanOn()
    ? humanFyi(
        attempts,
        catalog,
        viewer,
        requests.cohorts.map((p) => ({ ...p, read: read.cohorts[pairKey(p)] ?? "loading" })),
        humanOn(),
      )
    : humanFyi(attempts, catalog, viewer, undefined);
  const model = modelOn()
    ? modelFyi(
        attempts,
        catalog,
        viewer,
        requests.receipts.map((p) => ({ ...p, receipts: read.receipts[pairKey(p)] ?? "loading" })),
        read.lengths,
      )
    : modelFyi(attempts, catalog, viewer, undefined);
  return { human, model };
}
