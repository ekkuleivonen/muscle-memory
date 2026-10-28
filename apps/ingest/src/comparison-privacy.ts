import { safeIdentifier } from "../../../packages/domain/capture";
import { advanceComparisonGeneration } from "./comparison-fence";
import { verifyOwner } from "./owner";
import type { Env } from "./index";

export const MAX_MEMBERS = 100;
export type AgeEligibility = "adult" | "non-adult" | "unknown";
export interface ComparisonPrivacy {
  stealth: boolean;
  age: AgeEligibility;
  revision: string;
  acknowledged: boolean;
}
function state(value: unknown): value is ComparisonPrivacy {
  if (!value || typeof value !== "object") return false;
  const v = value as ComparisonPrivacy;
  return (
    typeof v.acknowledged === "boolean" &&
    typeof v.stealth === "boolean" &&
    ["adult", "non-adult", "unknown"].includes(v.age) &&
    typeof v.revision === "string" &&
    /^[a-f0-9-]{36}$/.test(v.revision)
  );
}

/** Original secret only; upload proofs/telemetry never write authoritative privacy. */
export async function comparisonPrivacy(
  env: Env,
  participant: string,
  input: unknown,
) {
  const reply = (status: number, body: Record<string, unknown>) => ({
    status,
    body,
  });
  if (!input || typeof input !== "object")
    return reply(400, { error: "Malformed request." });
  const v = input as Record<string, unknown>;
  const reading = v.action === "read";
  const allowed = reading
    ? ["secret", "action"]
    : ["secret", "action", "expectedRevision", "stealth", "age"];
  if (
    Object.keys(v).some((k) => !allowed.includes(k)) ||
    typeof v.secret !== "string" ||
    (!reading &&
      (v.action !== "update" ||
        typeof v.stealth !== "boolean" ||
        !["adult", "non-adult", "unknown"].includes(v.age as string) ||
        !(
          v.expectedRevision === null ||
          (typeof v.expectedRevision === "string" &&
            /^[a-f0-9-]{36}$/.test(v.expectedRevision))
        )))
  )
    return reply(400, { error: "Malformed request." });
  const owner = await verifyOwner(env, participant, v.secret);
  if (owner !== "owned")
    // A public caller with a guessed ID must not learn tombstone/ownership status.
    return reply(401, {
      error: "Privacy update denied.",
    });
  const key = `comparison-privacy/${participant}`;
  const previous = await env.CONTROL.get(key);
  const current = previous ? JSON.parse(await previous.text()) : null;
  if (previous && (!state(current) || !previous.etag))
    throw new Error("Privacy control unavailable.");
  if (reading) {
    if (await env.CONTROL.get(`deleted/${participant}`))
      return reply(410, { error: "Privacy update denied." });
    return reply(current && !current.acknowledged ? 202 : 200, {
      value: current,
    });
  }
  if ((current?.revision ?? null) !== v.expectedRevision)
    return reply(409, {
      error:
        "Privacy changed on another page. Retry after reviewing your settings.",
      revision: current?.revision ?? null,
    });
  const next: ComparisonPrivacy = {
    stealth: v.stealth as boolean,
    age: v.age as AgeEligibility,
    revision: crypto.randomUUID(),
    acknowledged: false,
  };
  // Conditional R2 writes stop overlapping or delayed requests overwriting an acknowledged change.
  const written = await env.CONTROL.put(key, JSON.stringify(next), {
    onlyIf: previous
      ? { etagMatches: previous.etag! }
      : { etagDoesNotMatch: "*" },
  });
  if (!written)
    return reply(409, { error: "Privacy changed. Review settings and retry." });
  const etag = (written as { etag?: string }).etag;
  if (!etag) throw new Error("Privacy control unavailable.");
  await advanceComparisonGeneration(env);
  if (await env.CONTROL.get(`deleted/${participant}`))
    return reply(410, { error: "Privacy update denied." });
  const confirmed = { ...next, acknowledged: true };
  const finalized = await env.CONTROL.put(key, JSON.stringify(confirmed), {
    onlyIf: { etagMatches: etag },
  });
  if (!finalized)
    return reply(409, { error: "Privacy changed. Review settings and retry." });
  if (await env.CONTROL.get(`deleted/${participant}`))
    return reply(410, { error: "Privacy update denied." });
  return reply(200, { value: confirmed });
}

/** Internal-only bounded lookup. No proofs, payloads, arbitrary paths or public ID lookup. */
export async function checkComparisonMembers(
  env: Env,
  members: unknown,
): Promise<(string | null)[]> {
  if (
    !Array.isArray(members) ||
    members.length > MAX_MEMBERS ||
    new Set(members).size !== members.length
  )
    throw new Error("Invalid comparison members.");
  for (const id of members) {
    if (typeof id !== "string") throw new Error("Invalid comparison members.");
    safeIdentifier(id);
  }
  const results: (string | null)[] = [];
  // Sequential bounded storage concurrency, no privacy or tombstone cache.
  for (const id of members as string[]) {
    if (await env.CONTROL.get(`deleted/${id}`)) {
      results.push(null);
      continue;
    }
    const stored = await env.CONTROL.get(`comparison-privacy/${id}`);
    const value = stored ? JSON.parse(await stored.text()) : null;
    const eligible =
      state(value) &&
      value.acknowledged &&
      !value.stealth &&
      value.age === "adult";
    const deleted = await env.CONTROL.get(`deleted/${id}`);
    results.push(eligible && !deleted ? value.revision : null);
  }
  return results;
}
