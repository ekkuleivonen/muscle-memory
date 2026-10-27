import { adminRoute } from "../../../../../lib/admin-server";
import { workbenchQuery } from "../../../../../lib/admin-sql";
export const dynamic = "force-dynamic";

/** Runs one checked, read-only statement (docs/admin-sql.md). POST only: never by a link. */
export const POST = adminRoute(workbenchQuery);
