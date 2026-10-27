import { adminRoute } from "../../../../../lib/admin-server";
import { publicChallenge } from "../../../../../lib/catalog-source";
import { jsonBody, ledgerDb } from "../../../../../lib/model-runs-server";
import { claim, harnessFailed } from "../../../../../../../packages/model-runs/ledger";
import { HARNESS_VERSION } from "../../../../../../../packages/model-runs/tools";
export const dynamic = "force-dynamic";

/** A run still marked running this long after it started was left by a closed tab. */
const STALE_MS = 2 * 60 * 60 * 1000;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Claims the next slot for this harness version under the run id the tab chose, with the
 * public revision to play: never a reference solution or anything private.
 */
export const POST = adminRoute(async (request) => {
  const body = await jsonBody(request, 4096);
  if (typeof body.runId !== "string" || !RUN_ID.test(body.runId))
    return Response.json({ error: "A run id is a UUID." }, { status: 400 });
  const db = await ledgerDb();
  const now = new Date();
  for (;;) {
    const slot = await claim(db, body.runId, now.toISOString(), {
      harnessVersion: HARNESS_VERSION,
      staleBefore: new Date(now.getTime() - STALE_MS).toISOString(),
    });
    if (!slot) return Response.json({ slot: null });
    const challenge = await publicChallenge(slot.challengeKey, slot.revision);
    if (challenge)
      return Response.json({
        slot,
        challenge: {
          metadata: { ...challenge.metadata, revision: slot.revision },
          revision: challenge.revision,
        },
      });
    await harnessFailed(db, slot.runId, "the revision is not available", now.toISOString());
  }
});
