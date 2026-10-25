import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import Link from "next/link";
import { supportsOneFilePractice } from "../../../lib/practice-contract";
import { summarize } from "../../../lib/library";
import { practiceHref } from "../../../lib/paths";
import { getLibrary } from "../../../lib/load";
import "../../_terminal/terminal.css";
import "../../practice/ide.css";
import { Ide } from "../../practice/ide";

type Props = {
  params: Promise<{ key: string }>;
  searchParams?: Promise<{ revision?: string }>;
};

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
 * Practice on one challenge, `/challenges/PY-002`, on its live revision. `?revision=sha256:…` opens one of
 * the issue's published revisions exactly, so a link can name the version it was made on; a
 * revision that is not published (another issue's, or one pruned since) opens the live one
 * at the plain URL instead. The issue's revisions travel to the browser as a JSON string,
 * because React's serializer would drop a "__proto__" fixture key from an object.
 */
export default async function WorkPage({ params, searchParams }: Props) {
  const { key } = await params;
  const wanted = (await searchParams)?.revision;
  await requireConsent(
    `${practiceHref(key)}${wanted ? `?revision=${encodeURIComponent(wanted)}` : ""}`,
  );
  const { findIssue, revisionsOf, issues } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) redirect(practiceHref(issue.key));
  const published = revisionsOf(issue.slug);
  if (wanted && !published[wanted]) redirect(practiceHref(issue.key));
  const revision = wanted ?? issue.revision;
  // The ticket as that revision has it.
  const content = published[revision];
  if (!supportsOneFilePractice(content))
    return (
      <main className="practice-version">
        <Link href="/issues">← Explore</Link>
        <h1>This older version is not supported in one-file practice</h1>
        <p>
          Its published files, requirements and recorded work are preserved. It
          cannot run in one-file practice without changing the challenge.
        </p>
        <p>
          The current version has one editable file and self-contained
          requirements. You can choose how to restore saved code before anything
          is replaced.
        </p>
        <Link className="btn primary" href={practiceHref(issue.key)}>
          Open current version
        </Link>
      </main>
    );
  return (
    <Ide
      key={`${issue.slug}:${revision}`}
      revisionsJson={JSON.stringify(published)}
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
        slug: issue.slug,
        revision,
        title: issue.title,
        task: content.body,
        kind: issue.kind,
        difficulty: issue.difficulty,
        labels: [...issue.labels],
        language: issue.language!,
        runnable: issue.runnable,
      }}
    />
  );
}
