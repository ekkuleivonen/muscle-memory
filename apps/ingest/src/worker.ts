import { WorkerEntrypoint } from "cloudflare:workers";
import ingest, { type Env } from "./index";
import { verifyOwner } from "./owner";
import { checkComparisonMembers } from "./comparison-privacy";
export default ingest;
/** Reachable only through an explicitly installed service binding, never public HTTP. */
export class ParticipantOwner extends WorkerEntrypoint<Env> {
  async verify(participant: string, secret: string) {
    try {
      return await verifyOwner(this.env, participant, secret);
    } catch {
      throw new Error("Ownership verification is unavailable.");
    }
  }
}

/** Deliberately separate from the approved ownership entrypoint; no live binding yet. */
export class ComparisonEligibility extends WorkerEntrypoint<Env> {
  async check(members: unknown) {
    if (this.env.COMPARISON_PRIVACY_ENABLED !== "true") throw new Error("Comparisons unavailable.");
    try { return await checkComparisonMembers(this.env, members); }
    catch { throw new Error("Comparisons unavailable."); }
  }
}
