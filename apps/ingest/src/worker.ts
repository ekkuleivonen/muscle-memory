import { WorkerEntrypoint } from "cloudflare:workers";
import ingest, { type Env } from "./index";
import { verifyOwner } from "./owner";
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
