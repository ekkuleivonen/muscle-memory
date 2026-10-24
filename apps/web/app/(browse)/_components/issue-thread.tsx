"use client";
import { useMemo } from "react";
import type { Revision } from "../../../../../packages/content/model";
import { timeAgo } from "../../../lib/activity";
import { feedbackOf } from "../../../lib/feedback";
import { Avatar } from "./bits";
import { Markdown } from "./markdown";
import { useNow, useRecords } from "./records";

/**
 * Teammates' later comments on the ticket, and their hints: whatever this person's work
 * released, read from the records on this device. Nothing shows before it is released.
 */
export function IssueThread({
  issue,
  revisionsJson,
}: {
  issue: string;
  /** Every published revision of the issue by id, as JSON: fixtures may hold a "__proto__" key. */
  revisionsJson: string;
}) {
  const records = useRecords();
  const now = useNow();
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  if (!records || !now) return null;
  return feedbackOf(records, issue).released.map((r, i) => {
    const from = revisions[r.issueRevision];
    const note =
      r.kind === "hint"
        ? from?.hints.find((h) => h.id === r.hint)
        : from?.team.find((c) => c.id === r.comment);
    if (!note) return null;
    const text =
      "level" in note
        ? note.text
        : r.kind === "comment"
          ? (note.text[r.wording] ?? note.text[0])
          : note.text[0];
    return (
      <div className="comment" key={i}>
        <Avatar name={note.author.name} />
        <div className="comment-box">
          <div className="comment-head">
            <b>{note.author.name}</b>
            <span className="role">{note.author.role}</span>
            <time className="dim" dateTime={r.at}>
              {timeAgo(r.at, now)}
            </time>
          </div>
          <Markdown className="comment-body" source={text} />
        </div>
      </div>
    );
  });
}
