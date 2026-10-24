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
import { StatusIcon } from "./icons";

const CHANGE = "muscle-memory:board";

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
  return {
    items,
    toTodo: (key: string) =>
      save(moveToTodo(items, key, new Date().toISOString())),
    toBacklog: (key: string) => save(moveToBacklog(items, key)),
  };
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
export function TodoButton({ issueKey }: { issueKey: string }) {
  const { items, toTodo, toBacklog } = useBoard();
  const [confirming, setConfirming] = useState(false);
  const onBoard = items.some((i) => i.key === issueKey);

  function toggle() {
    if (onBoard) return toBacklog(issueKey);
    if (todoFull(items) && !confirming) return setConfirming(true);
    setConfirming(false);
    toTodo(issueKey);
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
      toggle();
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
        onClick={toggle}
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
            <button className="btn" type="button" onClick={toggle}>
              Add anyway
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setConfirming(false)}
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
export function StatusField({ issueKey }: { issueKey: string }) {
  const { items, toTodo, toBacklog } = useBoard();
  const status = statusOf(items, issueKey);
  return (
    <>
      <StatusIcon status={status} /> {STATUS_LABELS[status]}
      <button
        type="button"
        className="link-btn"
        onClick={() =>
          status === "backlog" ? toTodo(issueKey) : toBacklog(issueKey)
        }
      >
        {status === "backlog" ? "Move to Todo" : "Back to backlog"}
      </button>
    </>
  );
}
