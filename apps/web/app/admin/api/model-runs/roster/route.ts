import { adminRoute } from "../../../../../lib/admin-server";
import { jsonBody, ledgerDb } from "../../../../../lib/model-runs-server";
import { addModel, addTarget, removeModel, removeTarget } from "../../../../../../../packages/model-runs/ledger";
import { EFFORTS, MODEL_ID, type Effort } from "../../../../../../../packages/model-runs/admin";
export const dynamic = "force-dynamic";

/**
 * Changes what is covered. `add-model` and `remove-model` change the model list (removing takes
 * its levels and waiting runs with it); `run` and `stop` switch one reasoning level of a model
 * on or off. Finished runs are never touched.
 */
export const POST = adminRoute(async (request) => {
  const body = await jsonBody(request, 4096);
  const bad = (error: string) => Response.json({ error }, { status: 400 });
  if (typeof body.model !== "string" || !MODEL_ID.test(body.model))
    return bad("Name a model as OpenRouter does: author/model.");
  const db = await ledgerDb();
  const now = new Date().toISOString();
  if (body.action === "add-model") await addModel(db, body.model, now);
  else if (body.action === "remove-model") await removeModel(db, body.model);
  else if (body.action === "run" || body.action === "stop") {
    if (!EFFORTS.includes(body.effort as Effort))
      return bad(`A reasoning level is one of ${EFFORTS.join(", ")}.`);
    const target = { model: body.model, effort: body.effort as string };
    if (body.action === "run") await addTarget(db, target, now);
    else await removeTarget(db, target);
  } else return bad("The action is add-model, remove-model, run or stop.");
  return Response.json({ ok: true });
});
