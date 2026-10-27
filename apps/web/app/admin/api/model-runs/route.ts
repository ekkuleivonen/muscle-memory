import { adminRoute } from "../../../../lib/admin-server";
import { ledgerDb } from "../../../../lib/model-runs-server";
import { recent, roster, summary } from "../../../../../../packages/model-runs/ledger";
import { HARNESS_VERSION } from "../../../../../../packages/model-runs/tools";
export const dynamic = "force-dynamic";

/** The roster, every series' counts and the latest runs. */
export const GET = adminRoute(async () => {
  const db = await ledgerDb();
  return Response.json({
    harnessVersion: HARNESS_VERSION,
    roster: await roster(db),
    series: await summary(db),
    recent: await recent(db),
  });
});
