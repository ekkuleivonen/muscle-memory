import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "./admin-server";
import { readStatistics } from "../../../packages/statistics/read";
import type { StatsWindow } from "../../../packages/statistics/query";
import type { StatsResult } from "../../../packages/statistics/result";
import type { CatalogDatabase } from "../../../packages/authoring/storage";
import { syntheticRevisions } from "../../../packages/statistics/exclusions";

export type StatisticsState =
  | { status: "unconfigured" | "idle" | "unavailable" }
  | { status: "ready"; result: StatsResult; queriedAt: string };

export async function adminStatistics(
  window: StatsWindow,
  run: boolean,
): Promise<StatisticsState> {
  await requireAdmin();
  const env =
    process.env.NODE_ENV === "development"
      ? process.env
      : ((await getCloudflareContext({ async: true })).env as unknown as Record<
          string,
          unknown
        >);
  const token = env.ADMIN_STATS_SQL_TOKEN;
  if (typeof token !== "string" || !token.trim())
    return { status: "unconfigured" };
  if (!run) return { status: "idle" };
  try {
    const db = env.CATALOG_DB as CatalogDatabase | undefined;
    if (!db) return { status: "unavailable" };
    const registry = await db
      .prepare(
        "SELECT challenge_key, revision, metadata_json FROM published_versions LIMIT 10001",
      )
      .all<{
        challenge_key: string;
        revision: string;
        metadata_json: string;
      }>();
    const exclusions = syntheticRevisions(registry.results ?? []);
    return {
      status: "ready",
      result: await readStatistics(token, window, fetch, exclusions),
      queriedAt: new Date().toISOString(),
    };
  } catch {
    // SQL errors can quote private expressions or input. Never render/log the upstream body.
    return { status: "unavailable" };
  }
}
