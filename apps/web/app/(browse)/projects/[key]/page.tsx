import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { requireConsent } from "../../../../lib/gate";
import {
  projectFilterValue,
  difficultyRange,
  languageLabel,
  languagesOf,
  projectHref,
} from "../../../../lib/library";
import { getLibrary } from "../../../../lib/load";
import { emptyIssueQuery, href } from "../../../../lib/queries";
import { ProjectSquare, LanguageDot } from "../../_components/bits";
import { FilterIcon } from "../../_components/icons";
import { IssueRows } from "../../_components/issue-list";
import { Markdown } from "../../_components/markdown";
import { Sep, Topbar } from "../../_components/topbar";

type Props = { params: Promise<{ key: string }> };

/** `key` is a project key such as FN (any case) or, for older links, its slug. */
async function find({ params }: Props) {
  const { key } = await params;
  const { findProject } = await getLibrary();
  return { project: findProject(decodeURIComponent(key)) };
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
  const { key } = await props.params;
  await requireConsent(`/projects/${key}`);
  const { project } = await find(props);
  if (!project) notFound();
  // One canonical URL per project: /projects/FN.
  if (key !== project.key) permanentRedirect(projectHref(project));
  return (
    <>
      <Topbar
        actions={
          <Link
            className="btn"
            href={href("/issues", {
              ...emptyIssueQuery(),
              project: [projectFilterValue(project)],
            })}
          >
            <FilterIcon /> View challenges
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
            <dt>Challenges</dt>
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
            Challenges <span className="count">{project.issues.length}</span>
          </h2>
          <IssueRows issues={project.issues} standalone showStatus={false} />
        </section>
      </main>
    </>
  );
}
