import { requireAdmin } from "../../../../lib/admin-server";
import { AuthoringEditor } from "../authoring";
import "../authoring.css";

export default async function NewChallengePage() {
  await requireAdmin();
  return <AuthoringEditor />;
}
