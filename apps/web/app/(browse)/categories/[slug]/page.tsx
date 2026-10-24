import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLibrary } from "../../../../lib/load";
import { difficultyRange, languagesOf } from "../../../../lib/library";
import { LanguageBadge } from "../../_components/badges";
import { IssueRows } from "../../_components/issue-rows";

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
  const { category, latest } = await find(props);
  if (!category) notFound();
  const range = difficultyRange(category.issues);
  return (
    <main className="page">
      <div className="crumbs">
        <Link href="/categories">Categories</Link> / {category.slug}
      </div>
      <h1>{category.title}</h1>
      {category.summary && <p className="muted">{category.summary}</p>}
      <div className="detail">
        <div>
          <section>
            <h2>About</h2>
            <p>{category.story}</p>
          </section>
          <section>
            <h2>Issues · in order</h2>
            <IssueRows issues={category.issues} latest={latest} numbered />
          </section>
        </div>
        <aside className="side" aria-label="Category details">
          <Link
            className="button ghost"
            href={`/issues?category=${category.slug}`}
          >
            Filter issues by this category
          </Link>
          <dl>
            <dt>Issues</dt>
            <dd>{category.issues.length}</dd>
            <dt>Difficulty</dt>
            <dd>{range || "—"}</dd>
            <dt>Languages</dt>
            <dd>
              {languagesOf(category.issues).map((id) => (
                <LanguageBadge key={id} language={id} />
              ))}
            </dd>
            <dt>Version</dt>
            <dd>{category.version}</dd>
          </dl>
        </aside>
      </div>
    </main>
  );
}
