import { requireAdmin } from "../../../../lib/admin-server";
import { AuthoringEditor } from "../authoring";
import "../authoring.css";

export default async function EditChallengePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await requireAdmin();
  const { key } = await params;
  return <AuthoringEditor challengeKey={key} />;
}
