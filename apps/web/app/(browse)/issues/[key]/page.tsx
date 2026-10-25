import { ChallengeExamples } from "../../_components/challenge-examples";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { requireConsent } from "../../../../lib/gate";
import { issueHref, projectHref, type Issue } from "../../../../lib/library";
import { getLibrary } from "../../../../lib/load";
import { formatQuery, emptyIssueQuery } from "../../../../lib/queries";
import {
  ProjectSquare,
  Estimate,
  LabelPill,
  LanguageTag,
} from "../../_components/bits";
import { KIND_LABELS, KindIcon } from "../../_components/icons";
import { IssueContext } from "../../_components/tracker-activity";
import { Sep, Topbar } from "../../_components/topbar";
import { Ask } from "../../_components/ask";
import { StartWork } from "../../_components/board";
import { Markdown } from "../../_components/markdown";
import { CopyIssueLink } from "../../_components/share";

type Props = { params: Promise<{ key: string }> };

/** `key` is an issue key such as RG-4 (any case) or the issue's permanent id. */
async function find({ params }: Props) {
  const { key } = await params;
  const { findIssue } = await getLibrary();
  return findIssue(decodeURIComponent(key));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const issue = await find(props);
  return issue
    ? {
        title: `${issue.key} ${issue.title} · Muscle Memory`,
        description: issue.summary,
      }
    : { title: "Challenge not found · Muscle Memory" };
}

const labelHref = (label: string) =>
  `/issues?${new URLSearchParams({ q: formatQuery({ ...emptyIssueQuery(), label: [label] }) })}`;

export default async function IssuePage(props: Props) {
  const { key } = await props.params;
  await requireConsent(`/issues/${key}`);
  const issue = await find(props);
  if (!issue) notFound();
  // One canonical URL per issue: /issues/RG-4. A lowercase key or the issue's id land here.
  if (key !== issue.key) permanentRedirect(issueHref(issue));
  const { project } = issue;
  return (
    <>
      <Topbar>
        {project ? (
          <Link href={projectHref(project)}>
            <ProjectSquare project={project} /> {project.title}
          </Link>
        ) : (
          <Link href="/issues">Explore</Link>
        )}
        <Sep />
        <span className="mono">{issue.key}</span>
      </Topbar>
      <IssueContext issue={{ id: issue.slug, revision: issue.revision }} />
      <main className="content issue">
        <article>
          <h1>{issue.title}</h1>
          {issue.summary && <p className="lede">{issue.summary}</p>}
          <div className="mobile-start">
            <StartWork
              issue={issue}
              href={`/work/${issue.key}`}
              label="Practice"
              warmOnMount
            />
          </div>
          <section className="section">
            <h2>Goal and requirements</h2>
            <Markdown source={issue.task} />
          </section>
          <ChallengeExamples examples={issue.criteria} />
        </article>
        <Properties issue={issue} />
      </main>
    </>
  );
}

function Properties({ issue }: { issue: Issue }) {
  return (
    <aside className="props" aria-label="Properties">
      <dl>
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
        <dt>Project</dt>
        <dd>
          {issue.project ? (
            <Link href={projectHref(issue.project)} className="tag">
              <ProjectSquare project={issue.project} /> {issue.project.title}
            </Link>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      <StartWork
        issue={{ key: issue.key, slug: issue.slug, revision: issue.revision }}
        href={`/work/${issue.key}`}
        label="Practice"
      />
      <CopyIssueLink issueKey={issue.key} />
      <Ask
        className="issue-ask"
        ids={["editor"]}
        from="issue"
        why={{
          editor:
            "Before you start: the editor opens with the keys you're used to.",
        }}
      />
      {!issue.runnable && (
        <p className="note">
          Automated checks are not available for this challenge. You can still
          open the code.
        </p>
      )}
    </aside>
  );
}
