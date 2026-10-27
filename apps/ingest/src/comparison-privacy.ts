import { safeIdentifier } from "../../../packages/domain/capture";
import { verifyOwner } from "./owner";
import type { Env } from "./index";

export const MAX_MEMBERS = 500;
export type AgeEligibility = "adult" | "non-adult" | "unknown";
export interface ComparisonPrivacy {
  stealth: boolean;
  age: AgeEligibility;
  revision: string;
}
function state(value: unknown): value is ComparisonPrivacy {
  if (!value || typeof value !== "object") return false;
  const v = value as ComparisonPrivacy;
  return typeof v.stealth === "boolean" && ["adult", "non-adult", "unknown"].includes(v.age)
    && typeof v.revision === "string" && /^[a-f0-9-]{36}$/.test(v.revision);
}

/** Original secret only; upload proofs/telemetry never write authoritative privacy. */
export async function comparisonPrivacy(env: Env, participant: string, input: unknown) {
  const reply = (status: number, body: Record<string, unknown>) => ({ status, body });
  if (!input || typeof input !== "object") return reply(400, { error: "Malformed request." });
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(k => !["secret", "expectedRevision", "stealth", "age"].includes(k)) ||
    typeof v.secret !== "string" || typeof v.stealth !== "boolean" ||
    !["adult", "non-adult", "unknown"].includes(v.age as string) ||
    !(v.expectedRevision === null || typeof v.expectedRevision === "string"))
    return reply(400, { error: "Malformed request." });
  const owner = await verifyOwner(env, participant, v.secret);
  if (owner !== "owned") return reply(owner === "deleted" ? 410 : 401, { error: "Privacy update denied." });
  const key = `comparison-privacy/${participant}`;
  const previous = await env.CONTROL.get(key);
  const current = previous ? JSON.parse(await previous.text()) : null;
  if (previous && (!state(current) || !previous.etag)) throw new Error("Privacy control unavailable.");
  if ((current?.revision ?? null) !== v.expectedRevision)
    return reply(409, { error: "Privacy changed on another page. Retry after reviewing your settings.", revision: current?.revision ?? null });
  const next: ComparisonPrivacy = { stealth: v.stealth, age: v.age as AgeEligibility, revision: crypto.randomUUID() };
  // Conditional R2 writes stop overlapping or delayed requests overwriting an acknowledged change.
  const written = await env.CONTROL.put(key, JSON.stringify(next), {
    onlyIf: previous ? { etagMatches: previous.etag! } : { etagDoesNotMatch: "*" },
  });
  if (!written) return reply(409, { error: "Privacy changed. Review settings and retry." });
  if (await env.CONTROL.get(`deleted/${participant}`)) return reply(410, { error: "Privacy update denied." });
  return reply(200, { revision: next.revision });
}

/** Internal-only bounded lookup. No proofs, payloads, arbitrary paths or public ID lookup. */
export async function checkComparisonMembers(env: Env, members: unknown): Promise<(string | null)[]> {
  if (!Array.isArray(members) || members.length > MAX_MEMBERS || new Set(members).size !== members.length)
    throw new Error("Invalid comparison members.");
  for (const id of members) {
    if (typeof id !== "string") throw new Error("Invalid comparison members.");
    safeIdentifier(id);
  }
  const results: (string | null)[] = [];
  // Sequential bounded storage concurrency, no privacy or tombstone cache.
  for (const id of members as string[]) {
    if (await env.CONTROL.get(`deleted/${id}`)) { results.push(null); continue; }
    const stored = await env.CONTROL.get(`comparison-privacy/${id}`);
    const value = stored ? JSON.parse(await stored.text()) : null;
    const eligible = state(value) && !value.stealth && value.age === "adult";
    const deleted = await env.CONTROL.get(`deleted/${id}`);
    results.push(eligible && !deleted ? value.revision : null);
  }
  return results;
}
