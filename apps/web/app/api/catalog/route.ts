/** Public content only. This route accepts no attempt records or participant data. */
import reference from "../../../../../content/catalog/reference.v1.json";
import { verifyCatalog } from "../../../../../packages/catalog/catalog";
export const dynamic = "force-dynamic";
export function GET() {
  // Published reference content only, digest-checked; never the demo catalog.
  return Response.json(verifyCatalog(reference), {
    headers: { "Cache-Control": "no-store" },
  });
}
