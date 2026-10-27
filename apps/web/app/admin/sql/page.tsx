import type { Metadata } from "next";
import { requireAdmin } from "../../../lib/admin-server";
import { workbenchLimits } from "../../../lib/admin-sql";
import { Workbench } from "./workbench";
import "./workbench.css";

export const metadata: Metadata = { title: "SQL workbench" };

export default async function SqlPage() {
  await requireAdmin();
  const { maxRows, timeoutMs, maxBytes, configured } = await workbenchLimits();
  return <Workbench limits={{ maxRows, timeoutMs, maxBytes, configured }} />;
}
