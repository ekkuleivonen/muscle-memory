import type { Metadata } from "next";
import Link from "next/link";
import { getLibrary } from "../../../lib/load";
import {
  difficultyRange,
  languageLabel,
  languagesOf,
} from "../../../lib/library";
import {
  filterCategories,
  parseCategoryQuery,
  type SearchParams,
} from "../../../lib/queries";
import { LanguageBadge } from "../_components/badges";
import { Filters } from "../_components/filters";

export const metadata: Metadata = { title: "Categories · Muscle Memory" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseCategoryQuery(await searchParams);
  const { categories, issues } = await getLibrary();
  const results = filterCategories(categories, query);
  return (
    <main className="page">
      <h1>Categories</h1>
      <p className="muted">
        Each category is a small project with its own story and a handful of
        issues.
      </p>
      <Filters
        path="/categories"
        query={query}
        placeholder="Search categories and their issues…"
        groups={[
          {
            key: "language",
            label: "Language",
            options: languagesOf(issues).map((id) => ({
              value: id,
              label: languageLabel(id),
            })),
          },
        ]}
      />
      <p className="result-count" role="status">
        {results.length} of {categories.length} categories
      </p>
      {results.length ? (
        <div className="cards">
          {results.map((category) => {
            const range = difficultyRange(category.issues);
            return (
              <Link
                key={category.slug}
                className="card"
                href={`/categories/${category.slug}`}
              >
                <h3>{category.title}</h3>
                <p>{category.summary ?? category.story}</p>
                <div className="row-meta">
                  <span>
                    {category.issues.length} issue
                    {category.issues.length === 1 ? "" : "s"}
                  </span>
                  {range && <span>· {range}</span>}
                  {languagesOf(category.issues).map((id) => (
                    <LanguageBadge key={id} language={id} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="empty">No categories match. Try fewer filters.</p>
      )}
    </main>
  );
}
