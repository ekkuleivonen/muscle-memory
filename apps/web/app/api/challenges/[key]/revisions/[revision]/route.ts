import { publicChallenge } from "../../../../../../lib/catalog-source";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ key: string; revision: string }>;
  },
) {
  const { key, revision } = await params;
  if (!/^[A-Z]+-\d+$/i.test(key) || !/^sha256:[a-f0-9]{64}$/.test(revision))
    return Response.json({ error: "Revision not available." }, { status: 404 });
  const historical = await publicChallenge(key, revision);
  return historical
    ? Response.json(historical, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ error: "Revision not available." }, { status: 404 });
}
