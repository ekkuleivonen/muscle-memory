import { notFound, redirect } from "next/navigation";
import { requireOnboarding } from "../../lib/gate";
import { getLibrary } from "../../lib/load";
import { pathWithQuery } from "../../lib/onboarding";

/** Old links: /workspace?challenge=id@version now open that issue in the IDE at /work/KEY. */
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requireOnboarding(pathWithQuery("/workspace", params));
  const match = /^([a-z0-9][a-z0-9-]*)@(\d+\.\d+\.\d+)$/.exec(
    typeof params.challenge === "string"
      ? params.challenge
      : "frequency-map@2.1.0",
  );
  if (!match) notFound();
  const { findIssue } = await getLibrary();
  const issue = findIssue(match[1]);
  if (!issue) notFound();
  redirect(
    issue.version === match[2]
      ? `/work/${issue.key}`
      : `/work/${issue.key}?version=${match[2]}`,
  );
}
