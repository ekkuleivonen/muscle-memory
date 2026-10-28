/**
 * Prints the launch-only report query for the admin SQL workbench (docs/launch-reporting.md).
 * Offline: reads nothing but the published-versions registry file it is given, sends nothing,
 * runs no SQL.
 *
 *   npm run launch:query -- --announced-at <receipt time> --receipt <announcement URL> \
 *     --as-of <instant> --registry .local/published-versions.json [--lookback-days 7]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { launchQuery, launchWindow } from "../packages/statistics/launch";
import { syntheticRevisions } from "../packages/statistics/exclusions";

const { values } = parseArgs({
  options: {
    "announced-at": { type: "string" },
    receipt: { type: "string" },
    "as-of": { type: "string" },
    "lookback-days": { type: "string" },
    registry: { type: "string" },
  },
  strict: true,
});
try {
  const window = launchWindow({
    announcedAt: values["announced-at"],
    receipt: values.receipt,
    asOf: values["as-of"],
    lookbackDays: values["lookback-days"] === undefined ? undefined : Number(values["lookback-days"]),
  });
  if (!values.registry)
    throw new Error("--registry is required: the published_versions rows, so synthetic QA revisions stay excluded.");
  // `wrangler d1 execute --json` wraps rows as [{ results: [...] }]; a plain array of rows works too.
  const parsed = JSON.parse(readFileSync(values.registry, "utf8"));
  const rows = Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0]?.results) ? parsed[0].results : parsed;
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("The registry file holds no published_versions rows; refusing to guess the synthetic QA list.");
  const exclusions = syntheticRevisions(rows);
  process.stdout.write(launchQuery(window, exclusions) + "\n");
  console.error(
    `Query for attempts started at or after ${window.announcedAt}, as of ${window.asOf}; ` +
      `${exclusions.length} synthetic QA revision(s) of ${rows.length} published excluded. Nothing was run.`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
