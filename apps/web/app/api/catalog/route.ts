/** Public content only. This route accepts no attempt records or participant data. */
import catalog from "../../../../../content/catalog/reference.v1.json";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
}
