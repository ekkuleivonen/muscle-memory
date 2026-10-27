import { adminRoute } from "../../../../../lib/admin-server";
import { publishedCatalog } from "../../../../../lib/catalog-source";
import { ledgerDb } from "../../../../../lib/model-runs-server";
import { sync, targets } from "../../../../../../../packages/model-runs/ledger";
import { TRIES } from "../../../../../../../packages/model-runs/admin";
import { HARNESS_VERSION } from "../../../../../../../packages/model-runs/tools";
export const dynamic = "force-dynamic";

/**
 * Makes the queue exactly what the roster still needs on the live revisions with this harness:
 * missing runs are queued, waiting runs no longer needed are dropped, finished runs are never
 * touched. Safe to call any time.
 */
export const POST = adminRoute(async () => {
  const db = await ledgerDb();
  const catalog = await publishedCatalog();
  return Response.json(
    await sync(db, {
      revisions: catalog.challenges.map((c) => ({ key: c.key, revision: c.revision })),
      targets: await targets(db),
      harnessVersion: HARNESS_VERSION,
      tries: TRIES,
      now: new Date().toISOString(),
    }),
  );
});
