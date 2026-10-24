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
  filterCategories,
  parseCategoryQuery,
  queryParam,
  type SearchParams,
} from "../../../lib/queries";
import { CategorySquare, LanguageDot } from "../_components/bits";
import { Toolbar } from "../_components/toolbar";
import { Topbar } from "../_components/topbar";

export const metadata: Metadata = { title: "Categories · Muscle Memory" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await requireOnboarding(pathWithQuery("/categories", params));
  const query = parseCategoryQuery(queryParam(params));
  const { categories, issues } = await getLibrary();
  const results = filterCategories(categories, query);
  return (
    <>
      <Topbar>
        <span>Categories</span>
        <span className="faint">{results.length}</span>
      </Topbar>
      <main className="content">
        <Toolbar
          path="/categories"
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
              {results.map((category) => (
                <tr key={category.slug}>
                  <td>
                    <div className="name">
                      <CategorySquare category={category} />
                      <div>
                        <Link href={`/categories/${category.slug}`}>
                          <b>{category.title}</b>
                        </Link>
                        <div className="dim">{category.summary}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono faint">{category.key}</td>
                  <td>{category.issues.length}</td>
                  <td className="dim">
                    {difficultyRange(category.issues) || "—"}
                  </td>
                  <td>
                    <div className="langs">
                      {languagesOf(category.issues).map((id) => (
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
          <p className="empty">No categories match this search.</p>
        )}
      </main>
    </>
  );
}
