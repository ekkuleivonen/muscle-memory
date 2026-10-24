import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarding } from "../../../../lib/gate";
import type { Issue } from "../../../../lib/library";
import { getLibrary } from "../../../../lib/load";
import { pathWithQuery } from "../../../../lib/onboarding";
import {
  formatQuery,
  emptyIssueQuery,
  type SearchParams,
} from "../../../../lib/queries";
import {
  Avatar,
  CategorySquare,
  Estimate,
  LabelPill,
  LanguageTag,
} from "../../_components/bits";
import {
  KIND_LABELS,
  KindIcon,
  PlayIcon,
  StatusIcon,
} from "../../_components/icons";
import { Sep, Topbar } from "../../_components/topbar";

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
    ? {
        title: `${issue.key} ${issue.title} · Muscle Memory`,
        description: issue.summary,
      }
    : { title: "Issue not found · Muscle Memory" };
}

const show = (value: unknown) => JSON.stringify(value);
const labelHref = (label: string) =>
  `/issues?${new URLSearchParams({ q: formatQuery({ ...emptyIssueQuery(), label: [label] }) })}`;

export default async function IssuePage(props: Props) {
  const [{ slug }, params] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  await requireOnboarding(pathWithQuery(`/issues/${slug}`, params));
  const { issue, latest } = await find(props);
  if (!issue) notFound();
  const category = issue.categories[0];
  return (
    <>
      <Topbar
        actions={
          issue.runnable && (
            <Link className="btn primary" href={workspaceHref(issue)}>
              <PlayIcon /> Start work
            </Link>
          )
        }
      >
        {category ? (
          <Link href={`/categories/${category.slug}`}>
            <CategorySquare category={category} /> {category.title}
          </Link>
        ) : (
          <Link href="/issues">Issues</Link>
        )}
        <Sep />
        <span className="mono">{issue.key}</span>
      </Topbar>
      <main className="content issue">
        <article>
          {latest && latest.version !== issue.version && (
            <p className="banner">
              You are viewing version {issue.version}.{" "}
              <Link href={`/issues/${issue.slug}`}>
                Open the latest ({latest.version})
              </Link>
            </p>
          )}
          <h1>{issue.title}</h1>
          {issue.summary && <p className="lede">{issue.summary}</p>}
          <section className="section">
            <h2>Description</h2>
            <p>{issue.task}</p>
          </section>
          <section className="section">
            <h2>
              Acceptance criteria{" "}
              <span className="count">{issue.criteria.length}</span>
            </h2>
            <ul className="checklist">
              {issue.criteria.map(({ input, expected }, i) => (
                <li key={i}>
                  <span className="box" aria-hidden />
                  <span>
                    {show(input)} <span className="arrow">→</span>{" "}
                    {show(expected)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="section">
            <h2>Activity</h2>
            <div className="timeline">
              {issue.comments.map((comment, i) => (
                <div className="comment" key={i}>
                  <Avatar name={comment.author} />
                  <div className="comment-box">
                    <div className="comment-head">
                      <b>{comment.author}</b>
                      {comment.role && (
                        <span className="role">{comment.role}</span>
                      )}
                    </div>
                    <div className="comment-body">{comment.body}</div>
                  </div>
                </div>
              ))}
              {issue.hints > 0 && (
                <div className="event">
                  <StatusIcon />
                  {issue.hints === 1
                    ? "A teammate has a hint ready if you get stuck."
                    : `Teammates have ${issue.hints} hints ready if you get stuck.`}
                </div>
              )}
              {!issue.comments.length && !issue.hints && (
                <p className="dim">No activity yet.</p>
              )}
            </div>
          </section>
        </article>
        <Properties issue={issue} />
      </main>
    </>
  );
}

function workspaceHref(issue: Issue) {
  return `/workspace?challenge=${encodeURIComponent(`${issue.slug}@${issue.version}`)}`;
}

function Properties({ issue }: { issue: Issue }) {
  return (
    <aside className="props" aria-label="Properties">
      {issue.runnable ? (
        <Link className="btn primary start" href={workspaceHref(issue)}>
          <PlayIcon /> Start work
        </Link>
      ) : (
        <p className="note">
          Read-only for now: only Python runs in the browser so far.
        </p>
      )}
      <dl>
        <dt>Status</dt>
        <dd>
          <StatusIcon /> Todo
        </dd>
        <dt>Kind</dt>
        <dd>
          <KindIcon kind={issue.kind} size={14} />
          {issue.kind ? KIND_LABELS[issue.kind] : "—"}
        </dd>
        <dt>Estimate</dt>
        <dd>
          <Estimate points={issue.estimate} /> {issue.difficulty ?? "—"}
        </dd>
        <dt>Language</dt>
        <dd>
          <LanguageTag language={issue.language} />
        </dd>
        <dt>Labels</dt>
        <dd>
          {issue.labels.map((label) => (
            <Link key={label} href={labelHref(label)}>
              <LabelPill label={label} />
            </Link>
          ))}
        </dd>
        <dt>Category</dt>
        <dd>
          {issue.categories.length
            ? issue.categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/categories/${c.slug}`}
                  className="tag"
                >
                  <CategorySquare category={c} /> {c.title}
                </Link>
              ))
            : "—"}
        </dd>
        <dt>Version</dt>
        <dd className="mono faint">{issue.version}</dd>
      </dl>
    </aside>
  );
}
