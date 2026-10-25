import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { inTicket } from "../../../lib/feedback";
import { isIncident } from "../../../lib/incident";
import { projectFilterValue } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import "../ide.css";
import { Ide } from "../ide";

type Props = {
  params: Promise<{ key: string }>;
  searchParams?: Promise<{ revision?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { findIssue } = await getLibrary();
  const issue = findIssue(decodeURIComponent((await params).key));
  return {
    title: issue
      ? `${issue.key} · IDE · Muscle Memory`
      : "Issue not found · Muscle Memory",
  };
}

/**
 * The IDE for one issue, `/work/FN-1`, on its live revision. The incident (INC-1) can open an
 * earlier published revision, `?revision=sha256:…`: a shared link plays the version the sharer
 * played, and an attempt stays on the revision it started on. An unknown revision is refused,
 * never swapped for the latest. The issue's revisions travel to
 * the browser as a JSON string, because React's serializer would drop a "__proto__" fixture key
 * from an object.
 */
export default async function WorkPage({ params, searchParams }: Props) {
  const { key } = await params;
  const wanted = (await searchParams)?.revision;
  await requireConsent(
    `/work/${key}${wanted ? `?revision=${encodeURIComponent(wanted)}` : ""}`,
  );
  const { findIssue, revisionsOf } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) redirect(`/work/${issue.key}`);
  const published = revisionsOf(issue.slug);
  if (wanted && (!isIncident(issue.key) || !published[wanted])) notFound();
  const revision = wanted ?? issue.revision;
  // The ticket as that revision has it.
  const content = published[revision];
  return (
    <Ide
      revisionsJson={JSON.stringify(published)}
      issue={{
        key: issue.key,
        slug: issue.slug,
        revision,
        title: issue.title,
        task: content.body,
        kind: issue.kind,
        difficulty: issue.difficulty,
        estimate: issue.estimate,
        labels: [...issue.labels],
        comments: content.team.filter(inTicket).map((c) => ({
          author: c.author.name,
          role: c.author.role,
          body: c.text[0],
        })),
        language: issue.language!,
        runnable: issue.runnable,
      }}
      // The repo's folder is the project's key, as in project:shop and /projects/SHOP.
      root={projectFilterValue(issue.project)}
    />
  );
}
