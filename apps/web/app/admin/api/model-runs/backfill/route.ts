import { adminRoute } from "../../../../../lib/admin-server";
import { publishedCatalog } from "../../../../../lib/catalog-source";
import { jsonBody, ledgerDb } from "../../../../../lib/model-runs-server";
import { backfill, conditionOf, roster } from "../../../../../../../packages/model-runs/ledger";
import { conditionFrom } from "../../../../../../../packages/model-runs/admin";
import { HARNESS_VERSION } from "../../../../../../../packages/model-runs/tools";
export const dynamic = "force-dynamic";

/**
 * Queues every slot the roster and the published revisions call for, in one condition, for
 * tries 1…tries. Existing slots are left alone.
 */
export const POST = adminRoute(async (request) => {
  const body = await jsonBody(request, 4096);
  let condition;
  try {
    condition = conditionFrom(body.condition);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const tries = Number(body.tries);
  if (!Number.isInteger(tries) || tries < 1 || tries > 10)
    return Response.json({ error: "Tries are 1 to 10." }, { status: 400 });
  const db = await ledgerDb();
  const models = await roster(db);
  const catalog = await publishedCatalog();
  const queued = await backfill(db, {
    revisions: catalog.challenges.map((c) => ({ key: c.key, revision: c.revision })),
    models,
    harnessVersion: HARNESS_VERSION,
    condition: conditionOf(condition),
    tries,
    now: new Date().toISOString(),
  });
  return Response.json({ queued, models: models.length, revisions: catalog.challenges.length });
});
