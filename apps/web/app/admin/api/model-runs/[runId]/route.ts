import { adminRoute } from "../../../../../lib/admin-server";
import { jsonBody, ledgerDb, storeRun } from "../../../../../lib/model-runs-server";
import { finish, harnessFailed, running } from "../../../../../../../packages/model-runs/ledger";
import { checkRunRecords } from "../../../../../../../packages/model-runs/admin";
import { runNdjson } from "../../../../../../../packages/model-runs/rows";
import type { RunOutcome } from "../../../../../../../packages/domain/model";
export const dynamic = "force-dynamic";

const OUTCOMES: readonly RunOutcome[] = ["completed", "stopped", "budget", "refused", "error"];

/**
 * Ends a running run. `finish`: the records are checked against the slot, stored as rows in
 * private R2, and the result is written to the ledger for good. `failed`: the harness failed,
 * and the slot runs again later.
 */
export const POST = adminRoute(async (request) => {
  const runId = new URL(request.url).pathname.split("/").at(-1)!;
  const body = await jsonBody(request, 64 * 1024 * 1024);
  const db = await ledgerDb();
  const slot = await running(db, runId);
  if (!slot) return Response.json({ error: "That run is not running." }, { status: 409 });
  const now = new Date().toISOString();
  if (body.action === "failed") {
    await harnessFailed(db, runId, String(body.error ?? "unknown").slice(0, 2000), now);
    return Response.json({ ok: true });
  }
  const outcome = body.outcome as RunOutcome;
  const turns = Number(body.turns);
  const submissions = Number(body.submissions);
  if (
    body.action !== "finish" ||
    !OUTCOMES.includes(outcome) ||
    !Number.isInteger(turns) ||
    !Number.isInteger(submissions)
  )
    return Response.json({ error: "A finished run has its outcome, turns and submissions." }, { status: 400 });
  let records;
  try {
    records = checkRunRecords(body.records, slot);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  await storeRun(runId, runNdjson(records, now));
  await finish(
    db,
    runId,
    { outcome, reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null, turns, submissions },
    now,
  );
  return Response.json({ ok: true });
});
