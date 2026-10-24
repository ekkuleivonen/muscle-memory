import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarding } from "../../../lib/gate";
import { LANGUAGES } from "../../../lib/languages";
import {
  difficultyRange,
  languageLabel,
  languagesOf,
} from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { pathWithQuery } from "../../../lib/onboarding";
import {
  filterProjects,
  parseProjectQuery,
  queryParam,
  type SearchParams,
} from "../../../lib/queries";
import { ProjectSquare, LanguageDot } from "../_components/bits";
import { Toolbar } from "../_components/toolbar";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Projects · Muscle Memory" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await requireOnboarding(pathWithQuery("/projects", params));
  const query = parseProjectQuery(queryParam(params));
  const { projects, issues } = await getLibrary();
  const results = filterProjects(projects, query);
  return (
    <>
      <Topbar>
        <span>Projects</span>
        <span className="faint">{results.length}</span>
      </Topbar>
      <main className="content">
        <Toolbar
          path="/projects"
          query={query}
          placeholder="lang:rust lighthouse …"
          filters={[
            {
              key: "language",
              label: "Language",
              options: languagesOf(issues).map((id) => ({
                value: id,
                label: LANGUAGES.find((l) => l.id === id)!.label,
                icon: <LanguageDot language={id} />,
              })),
            },
          ]}
        />
        {results.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Issues</th>
                <th>Difficulty</th>
                <th>Languages</th>
              </tr>
            </thead>
            <tbody>
              {results.map((project) => (
                <tr key={project.slug}>
                  <td>
                    <div className="name">
                      <ProjectSquare project={project} />
                      <div>
                        <Link href={`/projects/${project.slug}`}>
                          <b>{project.title}</b>
                        </Link>
                        <div className="dim">{project.summary}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono faint">{project.key}</td>
                  <td>{project.issues.length}</td>
                  <td className="dim">
                    {difficultyRange(project.issues) || "—"}
                  </td>
                  <td>
                    <div className="langs">
                      {languagesOf(project.issues).map((id) => (
                        <span key={id}>
                          <LanguageDot language={id} /> {languageLabel(id)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">No projects match this search.</p>
        )}
      </main>
    </>
  );
}
