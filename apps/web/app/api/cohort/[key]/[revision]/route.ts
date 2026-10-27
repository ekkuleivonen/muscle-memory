import { cookies } from "next/headers";
import { hasConsent, CONSENT_COOKIE } from "../../../../../lib/profile";
import { publicChallenge } from "../../../../../lib/catalog-source";
import { cohort } from "../../../../../lib/cohort-server";
import { CHALLENGE_KEY, REVISION } from "../../../../../../../packages/domain/records";
import { engineFor } from "../../../../../../../packages/runner/engines";
export const dynamic = "force-dynamic";
/** Suppressed aggregates for one public revision. No participant, filter or SQL input. Disabled for now. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; revision: string }> },
) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasConsent((await cookies()).get(CONSENT_COOKIE)?.value))
    return Response.json({ error: "Accept the current Terms before viewing comparisons." }, { status: 403, headers });
  const { key, revision } = await params;
  if (!CHALLENGE_KEY.test(key) || !REVISION.test(revision) || !(await publicChallenge(key, revision).catch(() => null)))
    return Response.json({ error: "Revision not available." }, { status: 404, headers });
  const current = await publicChallenge(key).catch(() => null);
  return Response.json(await cohort(key, revision, current?.metadata.revision === revision, current ? engineFor(current.revision.language)?.runtime : undefined), { headers });
}
