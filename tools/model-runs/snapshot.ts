/**
 * The daily price snapshot (docs/model-runs.md): OpenRouter's whole model list, and the
 * endpoints of every model on the roster (per-provider prices, latency, throughput, uptime),
 * each as the HTTP exchange verbatim, one row per request. Prices and providers change; runs
 * record the listing when they start and end, and this keeps the history between runs. The
 * rows go to an outbox file for ./store_events.py (`catalog`), into `default.model_catalog`.
 *
 *   node --import tsx tools/model-runs/snapshot.ts <outbox> [model …]
 *
 * Models come from the arguments, or from the roster in D1 when D1_ACCOUNT_ID, D1_DATABASE_ID
 * and D1_TOKEN are set. OPENROUTER_API_KEY, when set, is sent: the endpoints' latency and
 * throughput figures are only given to a signed-in caller. The model list needs no key.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HttpExchange } from "../../packages/domain/model";
import { d1, roster } from "../../packages/model-runs/ledger";
import { exchange, OPENROUTER } from "../../packages/model-runs/openrouter";

export interface CatalogRow {
  readonly snapshot_id: string;
  readonly fetched_at: string;
  readonly url: string;
  readonly status: number | null;
  /** The response headers as JSON. */
  readonly headers: string;
  readonly body: string | null;
  readonly error: string | null;
  readonly duration_ms: number;
}

export function catalogRow(id: string, fetchedAt: string, x: HttpExchange): CatalogRow {
  return {
    snapshot_id: id,
    fetched_at: fetchedAt,
    url: x.url,
    status: x.status,
    headers: JSON.stringify(x.headers),
    body: x.body,
    error: x.error,
    duration_ms: x.durationMs,
  };
}

/** Fetches the list and each model's endpoints; one row each, failures included. */
export async function snapshot(options: {
  readonly models: readonly string[];
  readonly fetch: typeof fetch;
  readonly apiKey?: string;
  readonly now?: () => Date;
  readonly endpoint?: string;
}): Promise<CatalogRow[]> {
  const endpoint = options.endpoint ?? OPENROUTER;
  const now = options.now ?? (() => new Date());
  const headers: Record<string, string> = options.apiKey
    ? { authorization: `Bearer ${options.apiKey}` }
    : {};
  const stamp = now().toISOString();
  const urls = [
    `${endpoint}/models`,
    ...options.models.map((model) => `${endpoint}/models/${model.split(":")[0]}/endpoints`),
  ];
  const rows: CatalogRow[] = [];
  for (const [index, url] of urls.entries()) {
    const fetchedAt = now().toISOString();
    const result = await exchange(options.fetch, url, headers, () => performance.now());
    rows.push(catalogRow(`${stamp}.${index}`, fetchedAt, result));
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outbox, ...listed] = process.argv.slice(2);
  if (!outbox) throw new Error("usage: snapshot.ts <outbox> [model …]");
  const env = process.env;
  const models =
    listed.length || !env.D1_TOKEN
      ? listed
      : await roster(
          d1({ accountId: env.D1_ACCOUNT_ID!, databaseId: env.D1_DATABASE_ID!, token: env.D1_TOKEN }),
        );
  const rows = await snapshot({ models, fetch, apiKey: env.OPENROUTER_API_KEY || undefined });
  await mkdir(outbox, { recursive: true });
  const path = join(outbox, `catalog-${rows[0].snapshot_id.replace(/[:.]/g, "-")}.ndjson`);
  await writeFile(`${path}.partial`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await rename(`${path}.partial`, path);
  console.log(
    `${rows.length} requests (${rows.filter((r) => r.status === 200).length} succeeded) → ${path}`,
  );
}
