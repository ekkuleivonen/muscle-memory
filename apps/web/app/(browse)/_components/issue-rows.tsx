import Link from "next/link";
import type { Issue } from "../../../lib/library";
import { DifficultyBadge, KindBadge, LanguageBadge, RunBadge } from "./badges";

export function issueHref(issue: Issue, latestVersion?: string): string {
  return latestVersion && latestVersion !== issue.version
    ? `/issues/${issue.slug}?version=${issue.version}`
    : `/issues/${issue.slug}`;
}

export function IssueRows({
  issues,
  latest,
  numbered = false,
}: {
  issues: readonly Issue[];
  /** Latest version per slug, so links to older pinned versions stay exact. */
  latest?: ReadonlyMap<string, string>;
  numbered?: boolean;
}) {
  if (!issues.length)
    return <p className="empty">No issues match. Try fewer filters.</p>;
  return (
    <ul className="rows">
      {issues.map((issue, index) => (
        <li key={`${issue.slug}@${issue.version}`}>
          <Link
            className="row"
            href={issueHref(issue, latest?.get(issue.slug))}
          >
            <span className="row-title">
              {numbered && <span className="muted">{index + 1}. </span>}
              {issue.title}
            </span>
            <span className="muted">{issue.slug}</span>
            <span className="row-meta">
              <KindBadge kind={issue.kind} />
              <DifficultyBadge difficulty={issue.difficulty} />
              <LanguageBadge language={issue.language} />
              <RunBadge runnable={issue.runnable} />
              {issue.summary && <span>{issue.summary}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
