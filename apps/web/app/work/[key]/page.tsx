import { projectFilterValue } from "../../../lib/library";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findEntry } from "../../../../../packages/catalog/gates";
import { requireOnboarding } from "../../../lib/gate";
import { publishedCatalog } from "../../../lib/catalog-source";
import { getLibrary } from "../../../lib/load";
import { pathWithQuery } from "../../../lib/onboarding";
import "../ide.css";
import { Ide } from "../ide";

type Props = {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
 * The IDE for one issue: `/work/FN-1`, or `?version=` for an older published version.
 * The Challenge travels to the browser as a JSON string, because React's serializer would
 * drop a "__proto__" fixture key from an object.
 */
export default async function WorkPage({ params, searchParams }: Props) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  await requireOnboarding(pathWithQuery(`/work/${key}`, query));
  const { findIssue, issueVersion, projects } = await getLibrary();
  const latest = findIssue(decodeURIComponent(key));
  if (!latest) notFound();
  const version =
    typeof query.version === "string" ? query.version : latest.version;
  const issue =
    version === latest.version ? latest : issueVersion(latest.slug, version);
  if (!issue) notFound();
  if (key !== issue.key)
    redirect(
      pathWithQuery(
        `/work/${issue.key}`,
        version === latest.version ? {} : { version },
      ),
    );
  const entry = findEntry(await publishedCatalog(), {
    kind: "challenge",
    id: issue.slug,
    version: issue.version,
  });
  if (!entry || !issue.workable)
    return (
      <main className="ide-missing">
        <p>
          {issue.key} {issue.title} can&apos;t open in the IDE: this version has
          no starter code.
        </p>
        <Link href={`/issues/${issue.key}`}>Back to the issue</Link>
      </main>
    );
  const project = projects.find((p) => p.slug === issue.project?.slug);
  return (
    <Ide
      challengeJson={JSON.stringify(entry.content)}
      issue={{
        key: issue.key,
        slug: issue.slug,
        version: issue.version,
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
      project={
        project
          ? {
              // The repo's folder is the project's key, as in project:shop and /projects/SHOP.
              slug: projectFilterValue(project),
              title: project.title,
              story: project.story,
            }
          : undefined
      }
    />
  );
}
