import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { projectFilterValue } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import "../ide.css";
import { Ide } from "../ide";

type Props = { params: Promise<{ key: string }> };

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
 * The IDE for one issue, `/work/FN-1`, on its live revision. The issue's revisions travel to
 * the browser as a JSON string, because React's serializer would drop a "__proto__" fixture key
 * from an object.
 */
export default async function WorkPage({ params }: Props) {
  const { key } = await params;
  await requireConsent(`/work/${key}`);
  const { findIssue, revisionsOf } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) redirect(`/work/${issue.key}`);
  return (
    <Ide
      revisionsJson={JSON.stringify(revisionsOf(issue.slug))}
      issue={{
        key: issue.key,
        slug: issue.slug,
        revision: issue.revision,
        title: issue.title,
        task: issue.task,
        kind: issue.kind,
        difficulty: issue.difficulty,
        estimate: issue.estimate,
        labels: [...issue.labels],
        comments: issue.comments.map((c) => ({ ...c })),
        language: issue.language!,
        runnable: issue.runnable,
      }}
      // The repo's folder is the project's key, as in project:shop and /projects/SHOP.
      root={projectFilterValue(issue.project)}
    />
  );
}
