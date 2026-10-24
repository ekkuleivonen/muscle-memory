"use client";
import { useSyncExternalStore } from "react";
import { statusOf, type Status } from "../../../lib/board";
import type { IssueSummary } from "../../../lib/library";
import { filterByStatus, groupIssues, type Group } from "../../../lib/queries";
import { useBoard } from "./board";
import { IssueGroups } from "./issue-list";

const noop = () => () => {};

/**
 * The issue list after the server's filters. Board status lives in this browser, so
 * is:todo and grouping by status are applied here, once the board can be read.
 */
export function IssueResults({
  issues,
  group,
  status,
  projects,
}: {
  issues: IssueSummary[];
  group: Group;
  status: Status[];
  projects: { slug: string; title: string }[];
}) {
  const { items } = useBoard();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const needsBoard = status.length > 0 || group === "status";
  // Avoid flashing an empty list before the board has been read.
  if (needsBoard && !hydrated)
    return <p className="hint">Reading your board…</p>;
  const of = (key: string) => statusOf(items, key);
  const visible = filterByStatus(issues, status, of);
  return (
    <>
      {status.length > 0 && (
        <p className="hint">
          {visible.length} of {issues.length} match your board status filter.
        </p>
      )}
      <IssueGroups groups={groupIssues(visible, group, projects, of)} />
    </>
  );
}
