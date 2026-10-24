import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLibrary } from "../../../../lib/load";
import type { Issue } from "../../../../lib/library";
import type { SearchParams } from "../../../../lib/queries";
import {
  DifficultyBadge,
  KindBadge,
  LanguageBadge,
  RunBadge,
} from "../../_components/badges";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

/** The requested version when it is published, otherwise the latest. */
async function find({ params, searchParams }: Props) {
  const [{ slug }, { version }] = await Promise.all([params, searchParams]);
  const { issues, issueVersion } = await getLibrary();
  const latest = issues.find((i) => i.slug === slug);
  const issue =
    typeof version === "string" && version !== latest?.version
      ? issueVersion(slug, version)
      : latest;
  return { issue, latest };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { issue } = await find(props);
  return issue
    ? { title: `${issue.title} · Muscle Memory`, description: issue.summary }
    : { title: "Issue not found · Muscle Memory" };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const show = (value: unknown) => JSON.stringify(value);

export default async function IssuePage(props: Props) {
  const { issue, latest } = await find(props);
  if (!issue) notFound();
  return (
    <main className="page">
      <div className="crumbs">
        <Link href="/issues">Issues</Link> / {issue.slug}
      </div>
      <h1>{issue.title}</h1>
      <div className="row-meta">
        <KindBadge kind={issue.kind} />
        <DifficultyBadge difficulty={issue.difficulty} />
        <LanguageBadge language={issue.language} />
        <RunBadge runnable={issue.runnable} />
      </div>
      {latest && latest.version !== issue.version && (
        <p className="note">
          You are viewing version {issue.version}.{" "}
          <Link href={`/issues/${issue.slug}`}>
            See the latest ({latest.version})
          </Link>
          .
        </p>
      )}
      <div className="detail">
        <div>
          {issue.summary && (
            <section>
              <h2>Summary</h2>
              <p>{issue.summary}</p>
            </section>
          )}
          <section>
            <h2>Description</h2>
            <p>{issue.task}</p>
          </section>
          <section>
            <h2>Acceptance criteria · {issue.criteria.length} checks</h2>
            <ul className="criteria">
              {issue.criteria.map(({ input, expected }, i) => (
                <li key={i}>
                  {show(input)} → {show(expected)}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Activity</h2>
            {issue.comments.length === 0 && (
              <p className="muted">No comments yet.</p>
            )}
            {issue.comments.map((comment, i) => (
              <div className="comment" key={i}>
                <span className="avatar" aria-hidden>
                  {initials(comment.author)}
                </span>
                <div className="bubble">
                  <div className="who">
                    {comment.author}
                    {comment.role && ` · ${comment.role}`}
                  </div>
                  {comment.body}
                </div>
              </div>
            ))}
            {issue.hints > 0 && (
              <p className="note">
                {issue.hints === 1
                  ? "A teammate has a hint"
                  : `Teammates have ${issue.hints} hints`}{" "}
                if you get stuck while working on this.
              </p>
            )}
          </section>
        </div>
        <Sidebar issue={issue} />
      </div>
    </main>
  );
}

function Sidebar({ issue }: { issue: Issue }) {
  return (
    <aside className="side" aria-label="Issue details">
      {issue.runnable ? (
        <Link
          className="button"
          href={`/workspace?challenge=${encodeURIComponent(`${issue.slug}@${issue.version}`)}`}
        >
          Start work →
        </Link>
      ) : (
        <p className="note" style={{ marginTop: 0 }}>
          This issue can be read but not run yet: only Python runs in the
          browser so far.
        </p>
      )}
      <dl>
        <dt>Kind</dt>
        <dd>
          <KindBadge kind={issue.kind} />
        </dd>
        <dt>Difficulty</dt>
        <dd>{issue.difficulty ?? "—"}</dd>
        <dt>Language</dt>
        <dd>
          <LanguageBadge language={issue.language} />
        </dd>
        <dt>Labels</dt>
        <dd>
          {issue.labels.map((label) => (
            <Link
              key={label}
              className="badge label"
              href={`/issues?q=${encodeURIComponent(label)}`}
            >
              {label}
            </Link>
          ))}
        </dd>
        <dt>Categories</dt>
        <dd>
          {issue.categories.length
            ? issue.categories.map((c) => (
                <Link key={c.slug} href={`/categories/${c.slug}`}>
                  {c.title}
                </Link>
              ))
            : "—"}
        </dd>
        <dt>Version</dt>
        <dd>{issue.version}</dd>
      </dl>
    </aside>
  );
}
