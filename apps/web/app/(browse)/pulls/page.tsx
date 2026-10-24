import type { Metadata } from "next";
import { requireConsent } from "../../../lib/gate";
import { LANGUAGES } from "../../../lib/languages";
import {
  DIFFICULTIES,
  KINDS,
  languagesOf,
  projectFilterValue,
  summarize,
} from "../../../lib/library";
import { getLibrary } from "../../../lib/load";
import { pathWithQuery } from "../../../lib/profile";
import {
  parsePullQuery,
  PULL_CHECKS,
  queryParam,
  type SearchParams,
} from "../../../lib/queries";
import { LanguageDot, ProjectSquare } from "../_components/bits";
import { KIND_LABELS, KindIcon } from "../_components/icons";
import { PullIcon, PullList } from "../_components/pulls";
import { Toolbar } from "../_components/toolbar";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Pull requests · Muscle Memory" };

const CHECKS_LABELS: Record<(typeof PULL_CHECKS)[number], string> = {
  passed: "Passed",
  failed: "Failed",
  errored: "Errored",
  cancelled: "Cancelled",
};

/**
 * Every pull request opened in this browser: the record of each attempt, searchable like
 * issues (`is:open checks:failed lang:go project:shop`).
 */
export default async function PullsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await requireConsent(pathWithQuery("/pulls", params));
  const query = parsePullQuery(queryParam(params));
  const { issues, projects } = await getLibrary();
  return (
    <>
      <Topbar>Pull requests</Topbar>
      <main className="content">
        <Toolbar
          path="/pulls"
          query={query}
          placeholder="is:open checks:failed lang:go project:shop …"
          filters={[
            {
              key: "state",
              label: "State",
              options: [
                { value: "open", label: "Open", icon: <PullIcon state="open" size={14} /> },
                { value: "merged", label: "Merged", icon: <PullIcon state="merged" size={14} /> },
              ],
            },
            {
              key: "checks",
              label: "Checks",
              options: PULL_CHECKS.map((c) => ({ value: c, label: CHECKS_LABELS[c] })),
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
        <PullList issues={issues.map(summarize)} query={query} />
        <p className="hint">
          <kbd>/</kbd> search · <kbd>j</kbd> <kbd>k</kbd> move · <kbd>↵</kbd>{" "}
          open
        </p>
      </main>
    </>
  );
}
