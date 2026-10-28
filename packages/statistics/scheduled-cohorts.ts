/** Existing web Worker only. Fixed background SQL, private aggregate artifacts, no page-load scan. */
import type { CatalogDatabase } from "../authoring/storage";
import type { SummaryBucket } from "../model-runs/summary-cache";
import { withinSummaryBudget } from "../model-runs/summary-cache";
import { CHALLENGE_KEY, REVISION } from "../domain/records";
import { COHORTS_ENABLED, COHORT_VERSION } from "./cohort";
import {
  cohortDiscoveryQuery,
  planHourlyCohorts,
  RUN_CHECK_SLOTS,
  MAX_CURRENT_COHORT_REVISIONS,
} from "./cohort-discovery";
import { cohortMemberQuery } from "./current-cohort";
import { readCohortBuildSpec } from "./cohort-source";
import {
  buildHumanSnapshot,
  serveHumanSnapshot,
  HUMAN_SNAPSHOT_VERSION,
  type ComparisonControl,
} from "./human-snapshot";
import { cohortWindow } from "./cohort-window";
import { syntheticRevisions } from "./exclusions";

export interface HumanSummaryEnvironment {
  HUMAN_SUMMARY_CACHE_ENABLED?: string;
  ADMIN_STATS_SQL_TOKEN?: string;
  CATALOG_DB?: CatalogDatabase;
  CONTENT?: SummaryBucket;
  COMPARISON_ELIGIBILITY?: ComparisonControl;
}
const BODY_LIMIT = 1024 * 1024;
const SNAPSHOT_LIMIT = 128 * 1024;
const JOB_MS = 10 * 60 * 1000;
/**
 * Service-binding calls per run: 1 generation read + 2 × RUN_CHECK_SLOTS check batches. The
 * documented limit is 32 Worker invocations per request, each binding call counting; this is a
 * hard stop below it, not a production confirmation of how scheduled events are counted.
 */
export const RUN_RPC_CALLS = 1 + 2 * RUN_CHECK_SLOTS;
const SUMMARY_PREFIX = `comparison-summaries/humans/${COHORT_VERSION}/${HUMAN_SNAPSHOT_VERSION}/`;
export function humanSummaryKey(challenge: string, revision: string) {
  if (!CHALLENGE_KEY.test(challenge) || !REVISION.test(revision))
    throw new Error("Invalid summary revision.");
  return `${SUMMARY_PREFIX}${challenge}/${revision}.json`;
}
/**
 * When each current snapshot was last written, from one bounded listing of the private snapshot
 * prefix: keys and upload times only, never contents. Null (rotate instead) when unavailable.
 */
async function lastRefreshed(
  bucket: SummaryBucket,
  ms: number,
): Promise<Map<string, number> | null> {
  if (!bucket.list) return null;
  try {
    const listed = await withinSummaryBudget(
      bucket.list({ prefix: SUMMARY_PREFIX, limit: 1000 }),
      ms,
    );
    if (!listed || listed.truncated || !Array.isArray(listed.objects)) return null;
    const at = new Map<string, number>();
    for (const o of listed.objects) {
      const m = /^([^/]+)\/([^/]+)\.json$/.exec(o.key.slice(SUMMARY_PREFIX.length));
      const t = o.uploaded instanceof Date ? o.uploaded.getTime() : NaN;
      if (m && Number.isFinite(t)) at.set(`${m[1]}/${m[2]}`, t);
    }
    return at;
  } catch {
    return null;
  }
}
/** The only transport caller supplies fixed discovery/member SQL; never exposed as an endpoint. */
export async function readCohortRows(
  token: string,
  query: string,
  parent: AbortSignal,
  request: typeof fetch = fetch,
) {
  parent.throwIfAborted();
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  let rejectStopped: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = () => reject(new Error("Cohort read stopped."));
  });
  signal.addEventListener("abort", rejectStopped, { once: true });
  const timer = setTimeout(() => controller.abort(), 15000);
  const wait = <T>(value: Promise<T>) => Promise.race([value, stopped]);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (signal.aborted) throw new Error("Cohort read stopped.");
    const response = await wait(
      request(
        "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
          signal,
          redirect: "manual",
          cache: "no-store",
        },
      ),
    );
    if (!response.ok || !response.body)
      throw new Error("Cohort read unavailable.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      parent.throwIfAborted();
      const { done, value } = await wait(reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) throw new Error("Cohort response exceeds budget.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      body?.success !== true ||
      !Array.isArray(body.result?.rows) ||
      body.result.rows.length > 1001
    )
      throw new Error("Cohort response unavailable.");
    return body.result.rows as unknown[];
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", rejectStopped);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}
/** Even cache misses/invalidations perform no SQL. Current generation is checked before return. */
export async function readHumanSummary(
  env: HumanSummaryEnvironment,
  challenge: string,
  revision: string,
  runtime: Record<string, string>,
) {
  if (
    env.HUMAN_SUMMARY_CACHE_ENABLED !== "true" ||
    !env.CONTENT ||
    !env.COMPARISON_ELIGIBILITY
  )
    return null;
  const deadline = Date.now() + 10000;
  try {
    const object = await withinSummaryBudget(
      env.CONTENT.get(humanSummaryKey(challenge, revision)),
      deadline - Date.now(),
    );
    if (!object || object.size > SNAPSHOT_LIMIT) return null;
    const text = await withinSummaryBudget(
      object.text(),
      deadline - Date.now(),
    );
    if (new TextEncoder().encode(text).length > SNAPSHOT_LIMIT) return null;
    return await withinSummaryBudget(
      serveHumanSnapshot(
        JSON.parse(text),
        { challenge, revision, runtime },
        env.COMPARISON_ELIGIBILITY,
      ),
      Math.max(0, deadline - Date.now()),
    );
  } catch {
    return null;
  }
}

export async function scheduledHumanSummaries(
  env: HumanSummaryEnvironment,
  now = new Date(),
  request: typeof fetch = fetch,
  budgetMs = JOB_MS,
) {
  if (!COHORTS_ENABLED || env.HUMAN_SUMMARY_CACHE_ENABLED !== "true")
    return { state: "disabled" as const };
  if (
    !env.CATALOG_DB ||
    !env.CONTENT ||
    !env.COMPARISON_ELIGIBILITY ||
    !env.ADMIN_STATS_SQL_TOKEN?.trim()
  )
    return { state: "unconfigured" as const };
  return refreshHumanSummaries(
    env as Required<HumanSummaryEnvironment>,
    now,
    request,
    budgetMs,
  );
}
/** Exported for synthetic adapter tests. Activation still requires BOTH source and environment gates. */
export async function refreshHumanSummaries(
  env: Required<HumanSummaryEnvironment>,
  now: Date,
  request: typeof fetch = fetch,
  budgetMs = JOB_MS,
) {
  const budget = Math.max(0, Math.min(JOB_MS, budgetMs));
  const deadline = Date.now() + budget;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), budget);
  const remaining = () => {
    stop.signal.throwIfAborted();
    if (Date.now() >= deadline) throw new Error("Refresh deadline exceeded.");
    return deadline - Date.now();
  };
  let queries = 0,
    refreshed = 0,
    failed = 0,
    registered = 0,
    discovered = 0,
    selectedCount = 0,
    oversized = 0,
    deferred = 0,
    slots = 0,
    rpcCalls = 0,
    ordering: "stalest-first" | "rotation" = "rotation";
  /** Coverage, so a partial run is never mistaken for a complete one. No IDs or revisions. */
  const account = () => ({
    queries,
    refreshed,
    failed,
    registered,
    discovered,
    selected: selectedCount,
    notRefreshed: discovered - refreshed,
    complete: discovered === refreshed,
    /** Never built: more potential browsers than one build may check. */
    oversized,
    /** Fit, but not in this run's CONTROL slots; first in a later run. */
    deferred,
    slots,
    slotBudget: RUN_CHECK_SLOTS,
    rpcCalls,
    ordering,
  });
  /** Every service-binding call counts; over the cap the call is refused, never made. */
  const rpc = <T>(call: () => Promise<T>) => {
    const ms = remaining();
    if (++rpcCalls > RUN_RPC_CALLS)
      throw new Error("Run service-binding budget reached.");
    return withinSummaryBudget(call(), ms);
  };
  const sql = async (query: string) => {
    remaining();
    if (++queries > 100) throw new Error("Hourly query budget reached.");
    return readCohortRows(
      env.ADMIN_STATS_SQL_TOKEN,
      query,
      stop.signal,
      request,
    );
  };
  const control: ComparisonControl = {
    generation: () => rpc(() => env.COMPARISON_ELIGIBILITY.generation()),
    check: (ids) => rpc(() => env.COMPARISON_ELIGIBILITY.check(ids)),
    authorize: (generation) =>
      rpc(() => env.COMPARISON_ELIGIBILITY.authorize(generation)),
  };
  try {
    const registry = await withinSummaryBudget(
      env.CATALOG_DB.prepare(
        `SELECT v.challenge_key, v.revision, v.metadata_json, v.published_at FROM published_versions v
       JOIN challenge_heads h ON h.challenge_key=v.challenge_key AND h.published_revision=v.revision
       WHERE h.lifecycle='published' ORDER BY v.challenge_key LIMIT ${MAX_CURRENT_COHORT_REVISIONS + 1}`,
      ).all<{
        challenge_key: string;
        revision: string;
        metadata_json: string;
        published_at: string;
      }>(),
      remaining(),
    );
    // Over the registry bound the whole human refresh stops: never a silent first-200 subset.
    if (registry.results.length > MAX_CURRENT_COHORT_REVISIONS)
      return { state: "registry-overflow" as const, ...account() };
    const excluded = new Set(
      syntheticRevisions(registry.results).map((r) => r.revision),
    );
    const revisions = registry.results
      .filter((r) => !excluded.has(r.revision))
      .map((r) => ({
        challenge: r.challenge_key,
        revision: r.revision,
        window: cohortWindow(r.published_at, now),
      }));
    registered = revisions.length;
    if (!revisions.length) return { state: "finished" as const, ...account() };
    const found = await sql(cohortDiscoveryQuery(revisions));
    discovered = Array.isArray(found) ? found.length : 0;
    const refreshedAt = await lastRefreshed(env.CONTENT, remaining());
    if (refreshedAt) ordering = "stalest-first";
    const plan = planHourlyCohorts(found, revisions, now, refreshedAt ?? undefined);
    const candidates = plan.builds;
    selectedCount = candidates.length;
    oversized = plan.oversized;
    deferred = plan.deferred;
    slots = plan.slots;
    if (!candidates.length) return { state: "finished" as const, ...account() };
    // One generation for the whole run, read before any member check (see buildHumanSnapshot).
    const generation = await control.generation();
    // No fence or an unreadable one: nothing can be authorized later, so build nothing.
    if (typeof generation !== "string" || !/^[a-f0-9-]{36}$/.test(generation))
      return { state: "unavailable" as const, ...account() };
    let next = 0;
    const build = async () => {
      while (next < candidates.length) {
        const candidate = candidates[next++];
        try {
          remaining();
          const spec = await withinSummaryBudget(
            readCohortBuildSpec(
              env.CATALOG_DB,
              env.CONTENT,
              candidate.challenge,
              candidate.revision,
              now,
            ),
            remaining(),
          );
          if (!spec) {
            failed++;
            continue;
          }
          remaining();
          const snapshot = await withinSummaryBudget(
            buildHumanSnapshot(
              spec,
              () =>
                sql(
                  cohortMemberQuery(spec.challenge, spec.revision, spec.window),
                ),
              control,
              undefined,
              { generation, maxMembers: candidate.slots * 100 },
            ),
            remaining(),
          );
          if (!snapshot) {
            failed++;
            continue;
          }
          remaining();
          const text = JSON.stringify(snapshot);
          if (new TextEncoder().encode(text).length > SNAPSHOT_LIMIT)
            throw new Error("Snapshot exceeds budget.");
          await withinSummaryBudget(
            env.CONTENT.put(
              humanSummaryKey(spec.challenge, spec.revision),
              text,
            ),
            remaining(),
          );
          refreshed++;
        } catch {
          failed++;
          if (stop.signal.aborted || Date.now() >= deadline) break;
        }
      }
    };
    await Promise.all([build(), build()]);
    return { state: "finished" as const, ...account() };
  } catch {
    return { state: "unavailable" as const, ...account() };
  } finally {
    clearTimeout(timer);
    stop.abort();
  }
}
