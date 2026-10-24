import { requireOnboarding } from "../../lib/gate";
import { pathWithQuery } from "../../lib/onboarding";
import { SelectedWorkspace } from "./selected";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOnboarding(pathWithQuery("/workspace", await searchParams));
  return <SelectedWorkspace />;
}
