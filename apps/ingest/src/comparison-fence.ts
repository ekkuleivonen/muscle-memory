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
/** The successful conditional put is the publication authorization point, not delivery. */
export async function authorizeComparisonGeneration(
  env: Env,
  generation: unknown,
): Promise<boolean> {
  if (!generationToken(generation)) return false;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const current = await read(env);
    if (!current || current.value.generation !== generation) return false;
    const written = await env.CONTROL.put(
      KEY,
      JSON.stringify({ generation, authorizationNonce: crypto.randomUUID() }),
      { onlyIf: { etagMatches: current.etag } },
    );
    if (written) return true;
    // Re-read before retrying; never overwrite an invalidation with the old generation.
  }
  return false;
}
