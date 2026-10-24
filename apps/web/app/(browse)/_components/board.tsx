"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  BOARD_KEY,
  moveToBacklog,
  moveToTodo,
  parseBoard,
  serializeBoard,
  STATUS_LABELS,
  statusOf,
  todoFull,
  type BoardItem,
} from "../../../lib/board";
import type { BoardMoveVia } from "../../../../../packages/domain/board";
import { ACTIVITY_KEY, parseConsent } from "../../../lib/activity-log";
import { logBoardMove } from "./board-log";
import { StatusIcon } from "./icons";

const CHANGE = "muscle-memory:board";

/** What a move needs to know about the issue: its key and the exact content shown. */
export interface IssueRef {
  key: string;
  slug: string;
  version: string;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

/** Your board on this device, shared by every component and kept in sync across tabs. */
export function useBoard() {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(BOARD_KEY),
    () => null,
  );
  const items = useMemo(() => parseBoard(raw), [raw]);
  const save = (next: BoardItem[]) => {
    localStorage.setItem(BOARD_KEY, serializeBoard(next));
    window.dispatchEvent(new Event(CHANGE));
  };
  /** Moves an issue and, if the activity log is on, records how it moved. */
  const move = (
    issue: IssueRef,
    to: "todo" | "backlog",
    via: BoardMoveVia,
    nudged = false,
  ) => {
    const onBoard = items.some((i) => i.key === issue.key);
    if (onBoard === (to === "todo")) return;
    save(
      to === "todo"
        ? moveToTodo(items, issue.key, new Date().toISOString())
        : moveToBacklog(items, issue.key),
    );
    void logBoardMove(
      { id: issue.slug, version: issue.version },
      {
        issueKey: issue.key,
        from: to === "todo" ? "backlog" : "todo",
        to,
        via,
        todoBefore: items.length,
        nudged,
      },
    );
  };
  return { items, move };
}

export function IssueStatus({ issueKey }: { issueKey: string }) {
  const { items } = useBoard();
  return <StatusIcon status={statusOf(items, issueKey)} />;
}

export function BoardCount() {
  const { items } = useBoard();
  return items.length ? <span className="count">{items.length}</span> : null;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * The one status anyone sets by hand: backlog ↔ Todo. `t` toggles it from the keyboard.
 * Over the soft limit it asks once instead of refusing.
 */
export function TodoButton({ issue }: { issue: IssueRef }) {
  const { items, move } = useBoard();
  const [confirming, setConfirming] = useState<BoardMoveVia | null>(null);
  const onBoard = items.some((i) => i.key === issue.key);

  function toggle(via: BoardMoveVia) {
    if (onBoard) return move(issue, "backlog", via);
    if (todoFull(items) && !confirming) return setConfirming(via);
    setConfirming(null);
    move(issue, "todo", confirming ?? via, !!confirming);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key !== "t" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        typing(event.target)
      )
        return;
      event.preventDefault();
      toggle("keyboard");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <span className="todo-wrap">
      <button
        type="button"
        className={onBoard ? "btn todo-btn" : "btn todo-btn primary-outline"}
        aria-pressed={onBoard}
        onClick={() => toggle("button")}
        title={`${onBoard ? "Back to backlog" : "Move to Todo"} (t)`}
      >
        <StatusIcon status={onBoard ? "todo" : "backlog"} />
        {onBoard ? "In Todo · back to backlog" : "Move to Todo"}
      </button>
      {confirming && (
        <span className="nudge" role="alert">
          <span>
            You already have {items.length} in Todo. Finish one first?
          </span>
          <span className="nudge-actions">
            <Link className="btn" href="/board">
              Open board
            </Link>
            <button
              className="btn"
              type="button"
              onClick={() => toggle("button")}
            >
              Add anyway
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/** Status in the properties panel, with the same backlog ↔ Todo switch. */
export function StatusField({ issue }: { issue: IssueRef }) {
  const { items, move } = useBoard();
  const status = statusOf(items, issue.key);
  return (
    <>
      <StatusIcon status={status} /> {STATUS_LABELS[status]}
      <button
        type="button"
        className="link-btn"
        onClick={() =>
          move(issue, status === "backlog" ? "todo" : "backlog", "status-field")
        }
      >
        {status === "backlog" ? "Move to Todo" : "Back to backlog"}
      </button>
    </>
  );
}

const noop = () => () => {};

/** Whether board moves are being recorded, always visible where moves happen. */
export function ActivityLogNote() {
  const on = useSyncExternalStore(
    subscribe,
    () => parseConsent(localStorage.getItem(ACTIVITY_KEY)) !== null,
    () => null,
  );
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (on === null) return null;
  return (
    <p className="hint">
      Activity log: <b>{on ? "on" : "off"}</b>.{" "}
      {on
        ? "Moves between the backlog and Todo are recorded in this browser only. "
        : "Moves are not recorded. "}
      <Link href="/onboarding">
        {on ? "Turn it off in Setup (log off)" : "Turn it on in Setup (log on)"}
      </Link>
    </p>
  );
}
