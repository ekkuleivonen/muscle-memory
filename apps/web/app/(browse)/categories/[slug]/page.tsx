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
import { CategorySquare, LanguageDot } from "../../_components/bits";
import { FilterIcon } from "../../_components/icons";
import { IssueRows } from "../../_components/issue-list";
import { Sep, Topbar } from "../../_components/topbar";

type Props = { params: Promise<{ slug: string }> };

async function find({ params }: Props) {
  const { slug } = await params;
  const { categories, issues } = await getLibrary();
  return {
    category: categories.find((c) => c.slug === slug),
    latest: new Map(issues.map((i) => [i.slug, i.version])),
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { category } = await find(props);
  return category
    ? {
        title: `${category.title} · Muscle Memory`,
        description: category.summary,
      }
    : { title: "Category not found · Muscle Memory" };
}

export default async function CategoryPage(props: Props) {
  await requireOnboarding(`/categories/${(await props.params).slug}`);
  const { category, latest } = await find(props);
  if (!category) notFound();
  return (
    <>
      <Topbar
        actions={
          <Link
            className="btn"
            href={href("/issues", {
              ...emptyIssueQuery(),
              category: [category.slug],
            })}
          >
            <FilterIcon /> View in issues
          </Link>
        }
      >
        <Link href="/categories">Categories</Link>
        <Sep />
        <span>{category.title}</span>
      </Topbar>
      <main className="content">
        <div className="category-head">
          <CategorySquare category={category} />
          <h1>{category.title}</h1>
        </div>
        {category.summary && <p className="dim">{category.summary}</p>}
        <dl className="facts">
          <div>
            <dt>Key</dt>
            <dd className="mono">{category.key}</dd>
          </div>
          <div>
            <dt>Issues</dt>
            <dd>{category.issues.length}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{difficultyRange(category.issues) || "—"}</dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd className="langs">
              {languagesOf(category.issues).map((id) => (
                <span key={id}>
                  <LanguageDot language={id} /> {languageLabel(id)}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <section className="section">
          <h2>About</h2>
          <p>{category.story}</p>
        </section>
        <section className="section">
          <h2>
            Issues <span className="count">{category.issues.length}</span>
          </h2>
          <IssueRows issues={category.issues} latest={latest} standalone />
        </section>
      </main>
    </>
  );
}
