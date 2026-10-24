"use client";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  BoardMoveTrigger,
  BoardMoveVia,
} from "../../../../../packages/domain/board";
import {
  activeCount,
  BOARD_CHANGE as CHANGE,
  BOARD_KEY,
  boardFull,
  complete as complete_,
  parseBoard,
  serializeBoard,
  setStatus,
  STATUS_LABELS,
  statusOf,
  type BoardItem,
  type ManualStatus,
  type Status,
} from "../../../lib/board";
import { logBoardMove } from "./board-log";
import { PlayIcon, StatusIcon } from "./icons";

const OPTIONS: readonly Status[] = ["backlog", "todo", "in-progress", "done"];

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
  /** Sets a status by hand and records the move. */
  const move = (
    issue: IssueRef,
    to: ManualStatus,
    via: BoardMoveVia,
    {
      nudged = false,
      trigger = "status-menu",
    }: { nudged?: boolean; trigger?: BoardMoveTrigger } = {},
  ) => {
    const from = statusOf(items, issue.key);
    if (from === to || from === "done") return;
    const next: BoardItem[] = setStatus(
      items,
      issue.key,
      to,
      new Date().toISOString(),
    );
    localStorage.setItem(BOARD_KEY, serializeBoard(next));
    window.dispatchEvent(new Event(CHANGE));
    void logBoardMove(
      { id: issue.slug, version: issue.version },
      {
        issueKey: issue.key,
        from,
        to,
        via,
        trigger,
        onBoardBefore: activeCount(items),
        nudged,
      },
    );
  };
  /**
   * The person merged a pull request (only one whose checks all passed): the issue moves to
   * Done, recorded with the pull request and the run that checked it. Reads the stored board,
   * not this render's, in case another tab moved the issue.
   */
  const complete = (
    issue: IssueRef,
    pullRequest: { number: number; runId: string },
    via: BoardMoveVia,
  ) => {
    const current = parseBoard(localStorage.getItem(BOARD_KEY));
    const from = statusOf(current, issue.key);
    if (from === "done") return;
    localStorage.setItem(
      BOARD_KEY,
      serializeBoard(complete_(current, issue.key, new Date().toISOString())),
    );
    window.dispatchEvent(new Event(CHANGE));
    void logBoardMove(
      { id: issue.slug, version: issue.version },
      {
        issueKey: issue.key,
        from,
        to: "done",
        via,
        trigger: "pull-request-merged",
        onBoardBefore: activeCount(current),
        nudged: false,
        pullRequest: pullRequest.number,
        runId: pullRequest.runId,
      },
    );
  };
  return { items, move, complete };
}

export function IssueStatus({ issueKey }: { issueKey: string }) {
  const { items } = useBoard();
  return <StatusIcon status={statusOf(items, issueKey)} />;
}

/** Issues being worked on; Done ones have left the queue. */
export function BoardCount() {
  const { items } = useBoard();
  const active = activeCount(items);
  return active ? <span className="count">{active}</span> : null;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Linear-style status dropdown: Backlog, Todo and In progress are yours to set; Done comes
 * from passing every check. `s` opens it, arrows move, Enter picks, Escape closes. Taking an
 * issue off the backlog over the soft limit asks once instead of refusing.
 */
export function StatusMenu({ issue }: { issue: IssueRef }) {
  const { items, move } = useBoard();
  const status = statusOf(items, issue.key);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [pending, setPending] = useState<ManualStatus | null>(null);
  const via = useRef<BoardMoveVia>("pointer");
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  function show(by: BoardMoveVia) {
    via.current = by;
    setPending(null);
    setCursor(Math.max(0, OPTIONS.indexOf(status)));
    setOpen(true);
  }

  function choose(to: Status, confirmed = false) {
    if (to === "done") return;
    const leavingBacklog = status === "backlog" && to !== "backlog";
    if (leavingBacklog && boardFull(items) && !confirmed) return setPending(to);
    move(issue, to, via.current, { nudged: confirmed });
    setPending(null);
    setOpen(false);
  }

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        open ||
        event.key !== "s" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        typing(event.target)
      )
        return;
      event.preventDefault();
      show("keyboard");
    }
    function onClick(event: MouseEvent) {
      if (open && !root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  });

  function onListKey(event: React.KeyboardEvent) {
    via.current = "keyboard";
    if (event.key === "Escape") setOpen(false);
    else if (event.key === "ArrowDown" || event.key === "j")
      setCursor((c) => Math.min(OPTIONS.length - 1, c + 1));
    else if (event.key === "ArrowUp" || event.key === "k")
      setCursor((c) => Math.max(0, c - 1));
    else if (event.key === "Enter" || event.key === " ")
      pending ? choose(pending, true) : choose(OPTIONS[cursor]);
    else return;
    event.preventDefault();
  }

  return (
    <div className="status-menu" ref={root}>
      <button
        type="button"
        className="status-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change status (s)"
        onClick={() => (open ? setOpen(false) : show("pointer"))}
      >
        <StatusIcon status={status} /> {STATUS_LABELS[status]}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="menu-pop status-pop">
          {pending ? (
            <div className="nudge-inline" role="alert">
              <p>
                You already have {items.length} on your board. Finish one first?
              </p>
              <div className="nudge-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    via.current = "pointer";
                    choose(pending, true);
                  }}
                >
                  Move anyway
                </button>
                <Link className="btn" href="/board">
                  Open board
                </Link>
              </div>
            </div>
          ) : (
            <ul
              ref={list}
              role="listbox"
              aria-label="Status"
              aria-activedescendant={`status-${OPTIONS[cursor]}`}
              tabIndex={-1}
              onKeyDown={onListKey}
            >
              {OPTIONS.map((option, index) => (
                <li
                  key={option}
                  id={`status-${option}`}
                  role="option"
                  aria-selected={option === status}
                  aria-disabled={option === "done"}
                  className={
                    index === cursor ? "menu-item current" : "menu-item"
                  }
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    via.current = "pointer";
                    choose(option);
                  }}
                >
                  <StatusIcon status={option} />
                  <span>{STATUS_LABELS[option]}</span>
                  {option === "done" ? (
                    <span className="faint auto">on merge</span>
                  ) : (
                    option === status && <span className="check">✓</span>
                  )}
                </li>
              ))}
              <li className="menu-note" role="presentation">
                Done is set when you merge a pull request.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Opens the workspace and, since that is starting, moves the issue to In progress on the way.
 * Already in progress (or done) stays as is.
 */
export function StartWork({ issue, href }: { issue: IssueRef; href: string }) {
  const { items, move } = useBoard();
  const status = statusOf(items, issue.key);
  return (
    <Link
      className="btn start"
      href={href}
      onClick={(event) =>
        // detail is 0 when a key, not a pointer, activated the link.
        move(
          issue,
          "in-progress",
          event.detail === 0 ? "keyboard" : "pointer",
          {
            trigger: "start-work",
          },
        )
      }
    >
      <PlayIcon /> {status === "in-progress" ? "Continue work" : "Start work"}
    </Link>
  );
}
