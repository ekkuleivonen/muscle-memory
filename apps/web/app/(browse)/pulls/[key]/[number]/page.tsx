import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { publishedCatalog } from "../../../../../lib/catalog-source";
import { requireOnboarding } from "../../../../../lib/gate";
import { projectFilterValue } from "../../../../../lib/library";
import { getLibrary } from "../../../../../lib/load";
import { repoFor } from "../../../../../lib/repo";
import type { LanguageId } from "../../../../../lib/languages";
import { PullView, type PullVersion } from "../../../_components/pulls";
import { Sep, Topbar } from "../../../_components/topbar";

type Props = { params: Promise<{ key: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, number } = await params;
  return { title: `${key.toUpperCase()} #${number} · Muscle Memory` };
}

type Executable = {
  id: string;
  version: string;
  task: string;
  inputs: unknown[];
  expected: unknown[];
  language?: LanguageId;
  entrypoint?: string;
  starter?: string;
  parameters?: string[];
  schema?: string;
  adapter?: string;
};

/**
 * One pull request, `/pulls/FN-1/2`. The pull request itself lives in this browser, so the
 * server sends every published version of the issue and the page picks the one it used.
 */
export default async function PullPage({ params }: Props) {
  const { key, number } = await params;
  await requireOnboarding(`/pulls/${key}/${number}`);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();
  const { findIssue, projects } = await getLibrary();
  const issue = findIssue(decodeURIComponent(key));
  if (!issue) notFound();
  if (key !== issue.key) permanentRedirect(`/pulls/${issue.key}/${n}`);
  const project = projects.find((p) => p.slug === issue.project?.slug);
  const catalog = await publishedCatalog();
  const versions: PullVersion[] = Object.values(catalog.entries)
    .filter(
      (e) =>
        e.kind === "challenge" &&
        e.state === "published" &&
        (e.content as unknown as Executable).id === issue.slug,
    )
    .flatMap((e) => {
      const c = e.content as unknown as Executable;
      if (!c.language || !c.entrypoint || typeof c.starter !== "string")
        return [];
      const repo = repoFor({
        key: issue.key,
        slug: issue.slug,
        language: c.language,
        entrypoint: c.entrypoint,
        starter: c.starter,
        task: c.task,
        parameters: c.parameters,
        schema: c.schema,
        adapter: c.adapter,
        criteria: c.inputs.map((input, i) => ({
          input,
          expected: c.expected[i],
        })),
        project: project && {
          slug: projectFilterValue(project),
          title: project.title,
          story: project.story,
        },
      });
      return [
        {
          version: c.version,
          challengeJson: JSON.stringify(c),
          starter: c.starter,
          path: repo.solution.path,
          language: c.language,
        },
      ];
    });
  return (
    <>
      <Topbar>
        <Link href="/pulls">Pull requests</Link>
        <Sep />
        <span className="mono">
          {issue.key} #{n}
        </span>
      </Topbar>
      <main className="content">
        <PullView
          issue={{
            key: issue.key,
            slug: issue.slug,
            title: issue.title,
            version: issue.version,
          }}
          number={n}
          versions={versions}
        />
      </main>
    </>
  );
}
