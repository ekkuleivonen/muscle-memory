import Link from "next/link";
import type { Issue } from "../../../lib/library";
import type { IssueGroup } from "../../../lib/queries";
import { Estimate, LabelPill, LanguageTag } from "./bits";
import { KindIcon, StatusIcon } from "./icons";

export function issueHref(issue: Issue, latestVersion?: string): string {
  return latestVersion && latestVersion !== issue.version
    ? `/issues/${issue.slug}?version=${issue.version}`
    : `/issues/${issue.slug}`;
}

function IssueRow({ issue, href }: { issue: Issue; href: string }) {
  return (
    <li>
      <Link className="row" href={href} data-row>
        <StatusIcon />
        <KindIcon kind={issue.kind} />
        <span className="key">{issue.key}</span>
        <span className="title">{issue.title}</span>
        <span className="meta">
          {issue.labels.slice(0, 2).map((label) => (
            <LabelPill key={label} label={label} />
          ))}
          <LanguageTag language={issue.language} />
          <Estimate points={issue.estimate} />
        </span>
      </Link>
    </li>
  );
}

export function IssueRows({
  issues,
  latest,
  standalone = false,
}: {
  issues: readonly Issue[];
  /** Latest version per slug, so links to older pinned versions stay exact. */
  latest?: ReadonlyMap<string, string>;
  standalone?: boolean;
}) {
  return (
    <ul className={standalone ? "rows standalone" : "rows"}>
      {issues.map((issue) => (
        <IssueRow
          key={`${issue.slug}@${issue.version}`}
          issue={issue}
          href={issueHref(issue, latest?.get(issue.slug))}
        />
      ))}
    </ul>
  );
}

export function IssueGroups({ groups }: { groups: readonly IssueGroup[] }) {
  if (!groups.length)
    return (
      <p className="empty">
        No issues match this search. Remove a filter or try fewer words.
      </p>
    );
  return groups.map((group) => (
    <section className="group" key={group.id} aria-label={group.label}>
      <div className="group-head">
        {group.label} <span className="count">{group.issues.length}</span>
      </div>
      <IssueRows issues={group.issues} />
    </section>
  ));
}
