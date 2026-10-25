import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { inTicket } from "../../../lib/feedback";
import { projectFilterValue, summarize } from "../../../lib/library";
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
 * The IDE for one issue, `/work/FN-1`, on its live revision. `?revision=sha256:…` opens one of
 * the issue's published revisions exactly, so a link can name the version it was made on; a
 * revision that is not published (another issue's, or one pruned since) opens the live one
 * at the plain URL instead. The issue's revisions travel to the browser as a JSON string,
 * because React's serializer would drop a "__proto__" fixture key from an object.
 */
export default async function WorkPage({ params, searchParams }: Props) {
  const { key } = await params;
  const wanted = (await searchParams)?.revision;
  await requireConsent(
    `/work/${key}${wanted ? `?revision=${encodeURIComponent(wanted)}` : ""}`,
  );
  const { findIssue, revisionsOf, issues } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) redirect(`/work/${issue.key}`);
  const published = revisionsOf(issue.slug);
  if (wanted && !published[wanted]) redirect(`/work/${issue.key}`);
  const revision = wanted ?? issue.revision;
  // The ticket as that revision has it.
  const content = published[revision];
  return (
    <Ide
      revisionsJson={JSON.stringify(published)}
      candidates={[
        summarize(issue),
        ...issues.filter((i) => i.key !== issue.key).map(summarize),
      ]}
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
