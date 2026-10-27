import { adminRoute } from "../../../../../lib/admin-server";
import { jsonBody, ledgerDb } from "../../../../../lib/model-runs-server";
import { addTarget, removeTarget } from "../../../../../../../packages/model-runs/ledger";
import { EFFORTS, MODEL_ID, type Effort } from "../../../../../../../packages/model-runs/admin";
export const dynamic = "force-dynamic";

/** Adds a target (a model at a reasoning effort) to the roster, or removes it (`remove: true`). */
export const POST = adminRoute(async (request) => {
  const body = await jsonBody(request, 4096);
  if (typeof body.model !== "string" || !MODEL_ID.test(body.model))
    return Response.json({ error: "Name a model as OpenRouter does: author/model." }, { status: 400 });
  if (!EFFORTS.includes(body.effort as Effort))
    return Response.json({ error: `A reasoning effort is one of ${EFFORTS.join(", ")}.` }, { status: 400 });
  const db = await ledgerDb();
  const target = { model: body.model, effort: body.effort as string };
  if (body.remove === true) await removeTarget(db, target);
  else await addTarget(db, target, new Date().toISOString());
  return Response.json({ ok: true });
});
