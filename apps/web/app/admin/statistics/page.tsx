import { requireAdmin } from "../../../lib/admin-server";
import {
  adminStatistics,
  type StatisticsState,
} from "../../../lib/admin-statistics";
import { publishedCatalog } from "../../../lib/catalog-source";
import { statsWindow } from "../../../../../packages/statistics/query";
import { Statistics } from "./statistics";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  let window = statsWindow({}),
    error: string | undefined;
  try {
    window = statsWindow(params);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Invalid filters.";
  }
  const state: StatisticsState = error
    ? { status: "idle" }
    : await adminStatistics(window, params.run === "1");
  const titles: Record<string, { title: string; revision: string }> = {};
  // Optional current titles are public metadata, never drafts or private QA material.
  if (state.status === "ready") {
    try {
      for (const c of (await publishedCatalog()).challenges)
        titles[c.key] = { title: c.title, revision: c.revision };
    } catch {
      /* Archive aggregates remain usable when current catalog metadata is unavailable. */
    }
  }
  return (
    <Statistics window={window} state={state} error={error} titles={titles} />
  );
}
