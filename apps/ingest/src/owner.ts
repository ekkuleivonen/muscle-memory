import { safeIdentifier } from "../../../packages/domain/capture";
import { sha256Hex } from "../../../packages/domain/ingest";
import type { Env } from "./index";
/** Private RPC only. Never use the upload proof cache as read authentication. */
export async function verifyOwner(
  env: Env,
  participant: string,
  secret: string,
): Promise<"owned" | "absent" | "deleted" | "denied"> {
  try {
    safeIdentifier(participant);
  } catch {
    return "denied";
  }
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256)
    return "denied";
  if (
    env.PER_PARTICIPANT &&
    !(await env.PER_PARTICIPANT.limit({ key: `history:${participant}` }))
      .success
  )
    return "denied";
  if (await env.CONTROL.get(`deleted/${participant}`)) return "deleted";
  const stored = await env.CONTROL.get(`participants/${participant}`);
  if (!stored) return "absent";
  const proof = (JSON.parse(await stored.text()) as { proof: unknown }).proof;
  if (typeof proof !== "string" || (await sha256Hex(secret)) !== proof)
    return "denied";
  if (await env.CONTROL.get(`deleted/${participant}`)) return "deleted";
  return "owned";
}
