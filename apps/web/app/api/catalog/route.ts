/** Public content only. This route accepts no attempt records or participant data. */
import { publishedCatalog } from "../../../lib/catalog-source";
export const dynamic = "force-dynamic";
export async function GET() {
  // Published content, digest-checked; plus the synthetic demo catalog only in demo builds,
  // the same content the pages show.
  return Response.json(await publishedCatalog(), {
    headers: { "Cache-Control": "no-store" },
  });
}
