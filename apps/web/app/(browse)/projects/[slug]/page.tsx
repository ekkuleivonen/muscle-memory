import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarding } from "../../../../lib/gate";
import {
  difficultyRange,
  languageLabel,
  languagesOf,
} from "../../../../lib/library";
import { getLibrary } from "../../../../lib/load";
import { emptyIssueQuery, href } from "../../../../lib/queries";
import { ProjectSquare, LanguageDot } from "../../_components/bits";
import { FilterIcon } from "../../_components/icons";
import { IssueRows } from "../../_components/issue-list";
import { Markdown } from "../../_components/markdown";
import { Sep, Topbar } from "../../_components/topbar";

type Props = { params: Promise<{ slug: string }> };

async function find({ params }: Props) {
  const { slug } = await params;
  const { projects, issues } = await getLibrary();
  return {
    project: projects.find((c) => c.slug === slug),
    latest: new Map(issues.map((i) => [i.slug, i.version])),
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { project } = await find(props);
  return project
    ? {
        title: `${project.title} · Muscle Memory`,
        description: project.summary,
      }
    : { title: "Project not found · Muscle Memory" };
}

export default async function ProjectPage(props: Props) {
  await requireOnboarding(`/projects/${(await props.params).slug}`);
  const { project, latest } = await find(props);
  if (!project) notFound();
  return (
    <>
      <Topbar
        actions={
          <Link
            className="btn"
            href={href("/issues", {
              ...emptyIssueQuery(),
              project: [project.slug],
            })}
          >
            <FilterIcon /> View in issues
          </Link>
        }
      >
        <Link href="/projects">Projects</Link>
        <Sep />
        <span>{project.title}</span>
      </Topbar>
      <main className="content">
        <div className="project-head">
          <ProjectSquare project={project} />
          <h1>{project.title}</h1>
        </div>
        {project.summary && <p className="dim">{project.summary}</p>}
        <dl className="facts">
          <div>
            <dt>Key</dt>
            <dd className="mono">{project.key}</dd>
          </div>
          <div>
            <dt>Issues</dt>
            <dd>{project.issues.length}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{difficultyRange(project.issues) || "—"}</dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd className="langs">
              {languagesOf(project.issues).map((id) => (
                <span key={id}>
                  <LanguageDot language={id} /> {languageLabel(id)}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <section className="section">
          <h2>About</h2>
          <Markdown source={project.story} />
        </section>
        <section className="section">
          <h2>
            Issues <span className="count">{project.issues.length}</span>
          </h2>
          <IssueRows issues={project.issues} latest={latest} standalone />
        </section>
      </main>
    </>
  );
}
