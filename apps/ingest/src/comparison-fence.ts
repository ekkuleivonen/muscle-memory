import type { Env } from "./index";
const KEY = "comparison-publication/fence";
const RETRIES = 3;
export const generationToken = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
type Fence = { generation: string; authorizationNonce: string };
async function read(env: Env) {
  const stored = await env.CONTROL.get(KEY);
  if (!stored) return null;
  const text = await stored.text();
  if (text.length > 1024) throw new Error("Comparison control unavailable.");
  const value = JSON.parse(text) as Fence;
  if (
    !value ||
    !generationToken(value.generation) ||
    !generationToken(value.authorizationNonce) ||
    !stored.etag
  )
    throw new Error("Comparison control unavailable.");
  return { value, etag: stored.etag };
}
export async function comparisonGeneration(env: Env): Promise<string | null> {
  return (await read(env))?.value.generation ?? null;
}
/** Only original-secret-authorized privacy/deletion mutations call this; never an RPC method. */
export async function advanceComparisonGeneration(env: Env): Promise<string> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const current = await read(env);
    const next: Fence = {
      generation: crypto.randomUUID(),
      authorizationNonce: crypto.randomUUID(),
    };
    const written = await env.CONTROL.put(KEY, JSON.stringify(next), {
      onlyIf: current
        ? { etagMatches: current.etag }
        : { etagDoesNotMatch: "*" },
    });
    if (written) return next.generation;
  }
  throw new Error("Comparison control unavailable.");
}
/**
 * The authorization point is this read of the current generation. R2 reads are strongly
 * consistent, and every privacy change or deletion advances the generation before it is
 * acknowledged, so a read after an acknowledgement can never return the old generation; a read
 * before it is an earlier authorization, which the contract allows to be delivered later. A read
 * writes nothing: public page loads never contend with, or delay, a privacy change or deletion.
 */
export async function authorizeComparisonGeneration(
  env: Env,
  generation: unknown,
): Promise<boolean> {
  if (!generationToken(generation)) return false;
  const current = await read(env);
  return current !== null && current.value.generation === generation;
}
