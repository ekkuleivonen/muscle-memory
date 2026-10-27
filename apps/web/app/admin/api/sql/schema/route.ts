import { adminRoute } from "../../../../../lib/admin-server";
import { workbenchSchema } from "../../../../../lib/admin-sql";
export const dynamic = "force-dynamic";

/** Lists and describes the events bucket's tables. POST, as it runs metadata queries. */
export const POST = adminRoute(workbenchSchema);
