import { adminRoute } from "../../../../lib/admin-server";
import { publishedCatalog } from "../../../../lib/catalog-source";
import { ledgerDb } from "../../../../lib/model-runs-server";
import { coverage, recent, roster, targets } from "../../../../../../packages/model-runs/ledger";
import { TRIES } from "../../../../../../packages/model-runs/admin";
import { HARNESS_VERSION } from "../../../../../../packages/model-runs/tools";
export const dynamic = "force-dynamic";

/** The live revisions, the model list, the levels that run, every slot's counts and the latest runs. */
export const GET = adminRoute(async () => {
  const db = await ledgerDb();
  const catalog = await publishedCatalog();
  return Response.json({
    harnessVersion: HARNESS_VERSION,
    tries: TRIES,
    live: catalog.challenges.map((c) => c.revision),
    models: await roster(db),
    targets: await targets(db),
    coverage: await coverage(db),
    recent: await recent(db),
  });
});
