import { adminRoute } from "../../../../lib/admin-server";
import { publishedCatalog } from "../../../../lib/catalog-source";
import { adminInventory } from "../../../../lib/admin-catalog";
export const dynamic = "force-dynamic";
export const GET = adminRoute(async () =>
  Response.json({
    challenges: adminInventory(await publishedCatalog()),
    lifecycleManagement: "unavailable",
    benchmarks: "unavailable",
    statistics: "unavailable",
  }),
);
