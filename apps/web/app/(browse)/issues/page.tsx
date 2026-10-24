import type { Metadata } from "next";
import { getLibrary } from "../../../lib/load";
import {
  DIFFICULTIES,
  KINDS,
  languageLabel,
  languagesOf,
} from "../../../lib/library";
import {
  filterIssues,
  parseIssueQuery,
  type SearchParams,
} from "../../../lib/queries";
import { Filters } from "../_components/filters";
import { IssueRows } from "../_components/issue-rows";

export const metadata: Metadata = { title: "Issues · Muscle Memory" };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseIssueQuery(await searchParams);
  const { issues, categories } = await getLibrary();
  const results = filterIssues(issues, query);
  return (
    <main className="page">
      <h1>Issues</h1>
      <p className="muted">
        Pick something up. Every issue is small enough for one sitting.
      </p>
      <Filters
        path="/issues"
        query={query}
        placeholder="Search titles, labels, languages…"
        groups={[
          {
            key: "language",
            label: "Language",
            options: languagesOf(issues).map((id) => ({
              value: id,
              label: languageLabel(id),
            })),
          },
          {
            key: "kind",
            label: "Kind",
            options: KINDS.map((k) => ({ value: k, label: k })),
          },
          {
            key: "difficulty",
            label: "Difficulty",
            options: DIFFICULTIES.map((d) => ({ value: d, label: d })),
          },
          {
            key: "category",
            label: "Category",
            options: categories.map((c) => ({ value: c.slug, label: c.title })),
          },
        ]}
      />
      <p className="result-count" role="status">
        {results.length} of {issues.length} issues
      </p>
      <IssueRows issues={results} />
    </main>
  );
}
