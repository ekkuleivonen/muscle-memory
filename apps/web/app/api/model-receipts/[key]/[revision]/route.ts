import { cookies } from "next/headers";
import { hasConsent, CONSENT_COOKIE } from "../../../../../lib/profile";
import { publicChallenge } from "../../../../../lib/catalog-source";
import { modelReceipts } from "../../../../../lib/model-receipts-server";
import {
  CHALLENGE_KEY,
  REVISION,
} from "../../../../../../../packages/domain/records";
export const dynamic = "force-dynamic";
/** Public model metadata only; no participant input or raw private event response. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; revision: string }> },
) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasConsent((await cookies()).get(CONSENT_COOKIE)?.value))
    return Response.json(
      { error: "Accept the current Terms before viewing comparisons." },
      { status: 403, headers },
    );
  const { key, revision } = await params;
  if (!CHALLENGE_KEY.test(key) || !REVISION.test(revision))
    return Response.json(
      { error: "Revision not available." },
      { status: 404, headers },
    );
  try {
    if (!(await publicChallenge(key, revision)))
      return Response.json(
        { error: "Revision not available." },
        { status: 404, headers },
      );
    return Response.json(await modelReceipts(key, revision), { headers });
  } catch {
    return Response.json(
      {
        state: "unavailable",
        receipts: [],
        truncated: false,
        readAt: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}
