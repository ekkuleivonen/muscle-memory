import { statsQuery, type StatsWindow } from "./query";
import { statsResult, type StatsResult } from "./result";

/** Private server transport, deliberately no public API, retries, persistence or raw-row return. */
export async function readStatistics(
  token: string,
  window: StatsWindow,
  request: typeof fetch = fetch,
  exclusions: { challenge: string; revision: string }[] = [],
): Promise<StatsResult> {
  if (!token.trim()) throw new Error("Statistics access is not configured.");
  const response = await request(
    "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: statsQuery(window, exclusions) }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error("Statistics query is unavailable.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Statistics response is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512 * 1024) {
      await reader.cancel();
      throw new Error("Statistics response is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (body?.success !== true) throw new Error("Statistics query failed.");
  return statsResult(body.result?.rows);
}
