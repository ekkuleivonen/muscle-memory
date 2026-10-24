import type { Metadata } from "next";
import { requireOnboarding } from "../../../lib/gate";
import { LANGUAGES } from "../../../lib/languages";
import { STATUS_LABELS } from "../../../lib/board";
import {
  projectFilterValue,
  DIFFICULTIES,
  KINDS,
  languagesOf,
  summarize,
} from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { pathWithQuery } from "../../../lib/onboarding";
import {
  filterIssues,
  STATUSES,
  parseGroup,
  parseIssueQuery,
  queryParam,
  type SearchParams,
} from "../../../lib/queries";
import { ProjectSquare, LanguageDot } from "../_components/bits";
import { KIND_LABELS, KindIcon, StatusIcon } from "../_components/icons";
import { IssueResults } from "../_components/issue-results";
import { Toolbar } from "../_components/toolbar";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Issues · Muscle Memory" };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await requireOnboarding(pathWithQuery("/issues", params));
  const query = parseIssueQuery(queryParam(params));
  const group = parseGroup(params);
  const { issues, projects } = await getLibrary();
  const results = filterIssues(issues, query);
  return (
    <>
      <Topbar>
        <span>Issues</span>
        <span className="faint">
          {results.length === issues.length
            ? issues.length
            : `${results.length} of ${issues.length}`}
        </span>
      </Topbar>
      <main className="content">
        <Toolbar
          path="/issues"
          query={query}
          group={group}
          placeholder="kind:bug lang:python,go difficulty:easy label:maps …"
          filters={[
            {
              key: "status",
              label: "Status",
              options: STATUSES.map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
                icon: <StatusIcon status={s} />,
              })),
            },
            {
              key: "kind",
              label: "Kind",
              options: KINDS.map((k) => ({
                value: k,
                label: KIND_LABELS[k],
                icon: <KindIcon kind={k} size={14} />,
              })),
            },
            {
              key: "language",
              label: "Language",
              options: languagesOf(issues).map((id) => ({
                value: id,
                label: LANGUAGES.find((l) => l.id === id)!.label,
                icon: <LanguageDot language={id} />,
              })),
            },
            {
              key: "difficulty",
              label: "Difficulty",
              options: DIFFICULTIES.map((d) => ({ value: d, label: d })),
            },
            {
              key: "project",
              label: "Project",
              options: projects.map((c) => ({
                value: projectFilterValue(c),
                label: c.title,
                icon: <ProjectSquare project={c} />,
              })),
            },
          ]}
        />
        <IssueResults
          issues={results.map(summarize)}
          group={group}
          status={query.status}
          projects={projects.map(({ slug, title }) => ({ slug, title }))}
        />
        <p className="hint">
          <kbd>/</kbd> search · <kbd>j</kbd> <kbd>k</kbd> move · <kbd>↵</kbd>{" "}
          open
        </p>
      </main>
    </>
  );
}
