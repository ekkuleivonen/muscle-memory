import { adminRoute } from "../../../../../lib/admin-server";
import { jsonBody, ledgerDb } from "../../../../../lib/model-runs-server";
import { setRoster } from "../../../../../../../packages/model-runs/ledger";
import { MODEL_ID } from "../../../../../../../packages/model-runs/admin";
export const dynamic = "force-dynamic";

/** Adds a model to the roster, or retires it (`retired: true`). */
export const POST = adminRoute(async (request) => {
  const body = await jsonBody(request, 4096);
  if (typeof body.model !== "string" || !MODEL_ID.test(body.model))
    return Response.json({ error: "Name a model as OpenRouter does: author/model." }, { status: 400 });
  await setRoster(await ledgerDb(), body.model, body.retired === true, new Date().toISOString());
  return Response.json({ ok: true });
});
