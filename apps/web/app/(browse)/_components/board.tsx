"use client";
import Link from "next/link";
import { engineFor, warmRuntime } from "../../../../../packages/runner/runner";
import {
  useEffect,
  useMemo,
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
  complete as complete_,
  replay as replay_,
  parseBoard,
  serializeBoard,
  setStatus,
  statusOf,
  type BoardItem,
  type ManualStatus,
  type Status,
} from "../../../lib/board";
import { logBoardMove } from "./board-log";
import { PlayIcon } from "./icons";

const OPTIONS: readonly Status[] = ["backlog", "todo", "in-progress", "done"];

/** What a move needs to know about the issue: its key and the exact content shown. */
export interface IssueRef {
  key: string;
  slug: string;
  /** The live revision when the move happened. */
  revision: string;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

const noSubscription = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** Your board on this device, shared by every component and kept in sync across tabs. */
export function useBoard() {
  const hydrated = useHydrated();
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
      { id: issue.slug, revision: issue.revision },
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
   * The person chose to take a done issue again: back to In progress, recorded as a replay,
   * which starts a new attempt (lib/attempts). `issue.revision` is the revision replayed.
   * Resolves once the move is stored, so the IDE opens on the new attempt.
   */
  const replay = async (
    issue: IssueRef,
    via: BoardMoveVia,
  ): Promise<boolean> => {
    const current = parseBoard(localStorage.getItem(BOARD_KEY));
    if (statusOf(current, issue.key) !== "done") return false;
    const stored = await logBoardMove(
      { id: issue.slug, revision: issue.revision },
      {
        issueKey: issue.key,
        from: "done",
        to: "in-progress",
        via,
        trigger: "replay",
        onBoardBefore: activeCount(current),
        nudged: false,
      },
    );
    // Without the record there is no new attempt, so the board stays as it was.
    if (!stored) return false;
    localStorage.setItem(
      BOARD_KEY,
      serializeBoard(replay_(current, issue.key)),
    );
    window.dispatchEvent(new Event(CHANGE));
    return true;
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
    if (from === "done") return Promise.resolve(false);
    localStorage.setItem(
      BOARD_KEY,
      serializeBoard(complete_(current, issue.key, new Date().toISOString())),
    );
    window.dispatchEvent(new Event(CHANGE));
    // Resolves once the merge is stored, for pages that read it back.
    return logBoardMove(
      { id: issue.slug, revision: issue.revision },
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
  return { items, move, complete, replay, hydrated };
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Opens the workspace and, since that is starting, moves the issue to In progress on the way.
 * Already in progress (or done) stays as is.
 */
export function StartWork({
  issue,
  href,
  warmOnMount = false,
  label,
}: {
  issue: IssueRef & { language?: string | null };
  href: string;
  warmOnMount?: boolean;
  /** Presentation only; starting keeps its existing recording semantics. */
  label?: string;
}) {
  const warm = () => {
    const engine = issue.language && engineFor(issue.language);
    if (engine) warmRuntime(engine);
  };
  useEffect(() => {
    if (warmOnMount) warm();
  }, [issue.language, warmOnMount]);
  const { items, move } = useBoard();
  const status = statusOf(items, issue.key);
  return (
    <Link
      className="btn start"
      onFocus={warm}
      onPointerEnter={warm}
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
      <PlayIcon />{" "}
      {label ?? (status === "in-progress" ? "Continue work" : "Start work")}
    </Link>
  );
}
