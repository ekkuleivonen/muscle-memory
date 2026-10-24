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
import { useBoard } from "./board";
import { useAccount } from "./profile-menu";
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

export function Suggestions({ issues }: { issues: Issue[] }) {
  const { items } = useBoard();
  // Read through the store hook, so hydration sees the same (empty) profile as the server.
  const languages = useAccount()?.profile.languages ?? [];
  const picks = suggestions(issues, items, languages);
  return picks.length ? <IssueRows issues={picks} standalone /> : null;
}
