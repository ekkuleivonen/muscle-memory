"use client";
import Link from "next/link";
import {
  boardIssues,
  COLUMNS,
  STATUS_LABELS,
  suggestions,
  type Status,
} from "../../../lib/board";
import { issueHref, type IssueSummary as Issue } from "../../../lib/library";
import { PROFILE_KEY, type StoredProfile } from "../../../lib/onboarding";
import { useBoard } from "./board";
import { Estimate, LanguageTag } from "./bits";
import { KindIcon, StatusIcon } from "./icons";
import { IssueRows } from "./issue-list";

/** Columns after Todo fill themselves from workspace evidence; nobody moves cards. */
const EMPTY: Record<Status, string> = {
  backlog: "",
  todo: "Set an issue's status to Todo and it appears here.",
  "in-progress": "Set an issue to In progress when you start on it.",
  done: "Issues land here on their own when every acceptance check passes.",
};

export function Board({
  issues,
  view,
}: {
  issues: Issue[];
  view: "board" | "list";
}) {
  const { items } = useBoard();
  const onBoard = boardIssues(items, issues);
  const inColumn = (status: Status) =>
    onBoard.filter((b) => b.status === status).map((b) => b.issue);
  if (!onBoard.length)
    return (
      <div className="empty">
        <p>Your board is empty.</p>
        <p className="dim">
          Open an issue and set its status (<kbd>s</kbd>) to Todo. These are a
          good start:
        </p>
        <Suggestions issues={issues} />
      </div>
    );
  if (view === "list")
    return COLUMNS.filter((s) => inColumn(s).length).map((status) => (
      <section
        className="group"
        key={status}
        aria-label={STATUS_LABELS[status]}
      >
        <div className="group-head">
          <StatusIcon status={status} /> {STATUS_LABELS[status]}
          <span className="count">{inColumn(status).length}</span>
        </div>
        <IssueRows issues={inColumn(status)} />
      </section>
    ));
  return (
    <div className="board">
      {COLUMNS.map((status) => (
        <section
          key={status}
          className="column"
          aria-label={STATUS_LABELS[status]}
        >
          <h2>
            <StatusIcon status={status} /> {STATUS_LABELS[status]}
            <span className="count">{inColumn(status).length}</span>
          </h2>
          {inColumn(status).map((issue) => (
            <Link
              key={issue.key}
              className="board-card"
              href={issueHref(issue)}
              data-row
            >
              <span className="key">
                <KindIcon kind={issue.kind} size={14} /> {issue.key}
              </span>
              <span className="title">{issue.title}</span>
              <span className="meta">
                <LanguageTag language={issue.language} />
                <Estimate points={issue.estimate} />
              </span>
            </Link>
          ))}
          {!inColumn(status).length && <p className="hint">{EMPTY[status]}</p>}
        </section>
      ))}
    </div>
  );
}

function profileLanguages(): string[] {
  try {
    const stored = JSON.parse(
      localStorage.getItem(PROFILE_KEY) ?? "null",
    ) as StoredProfile | null;
    return stored?.profile.languages ?? [];
  } catch {
    return [];
  }
}

export function Suggestions({ issues }: { issues: Issue[] }) {
  const { items } = useBoard();
  const picks = suggestions(
    issues,
    items,
    typeof window === "undefined" ? [] : profileLanguages(),
  );
  return picks.length ? <IssueRows issues={picks} standalone /> : null;
}

/** Home: what is on your board, then something to move to Todo. */
export function Dashboard({ issues }: { issues: Issue[] }) {
  const { items } = useBoard();
  const onBoard = boardIssues(items, issues);
  return (
    <>
      <section className="section">
        <h2>
          On your board <span className="count">{onBoard.length}</span>
          {onBoard.length > 0 && (
            <Link className="see-all" href="/board">
              Open board →
            </Link>
          )}
        </h2>
        {onBoard.length ? (
          <IssueRows issues={onBoard.map((b) => b.issue)} standalone />
        ) : (
          <p className="dim">
            Nothing on your board yet. Open an issue and set its status with{" "}
            <kbd>s</kbd>.
          </p>
        )}
      </section>
      <section className="section">
        <h2>Suggested from the backlog</h2>
        <Suggestions issues={issues} />
      </section>
    </>
  );
}
