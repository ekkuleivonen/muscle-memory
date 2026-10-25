import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { summarize } from "../../../lib/library";
import { practiceHref } from "../../../lib/paths";
import { getLibrary } from "../../../lib/load";
import "../../_terminal/terminal.css";
import "../../practice/ide.css";
import { Ide } from "../../practice/ide";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { findIssue } = await getLibrary();
  const issue = findIssue(decodeURIComponent((await params).key));
  return {
    title: issue
      ? `${issue.key} · Practice · Muscle Memory`
      : "Challenge not found · Muscle Memory",
  };
}

/**
 * Practice on one challenge, `/challenges/PY-002`, on its live revision. A lowercase key or the
 * challenge's id redirects to the key. The revision travels to the browser as a JSON string,
 * because React's serializer would drop a "__proto__" fixture key from an object.
 */
export default async function PracticePage({ params }: Props) {
  const { key } = await params;
  await requireConsent(practiceHref(key));
  const { findIssue, revision: revisionOf, issues } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) redirect(practiceHref(issue.key));
  const content = revisionOf(issue.revision)!;
  return (
    <Ide
      key={`${issue.key}:${issue.revision}`}
      revisionJson={JSON.stringify(content)}
      trail={[
        { label: "challenges", href: "/challenges" },
        { label: issue.key, href: practiceHref(issue.key) },
      ]}
      candidates={[
        summarize(issue),
        ...issues.filter((i) => i.key !== issue.key).map(summarize),
      ]}
      issue={{
        key: issue.key,
        revision: issue.revision,
        title: issue.title,
        task: content.task,
        difficulty: issue.difficulty,
        tags: [...issue.tags],
        language: issue.language!,
        runnable: issue.runnable,
      }}
    />
  );
}
