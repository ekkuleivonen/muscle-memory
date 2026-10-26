import { requireAdmin } from "../../../lib/admin-server";
import { AuthoringList } from "./authoring";
import "./authoring.css";

export default async function AuthoringPage() {
  await requireAdmin();
  return <AuthoringList />;
}
