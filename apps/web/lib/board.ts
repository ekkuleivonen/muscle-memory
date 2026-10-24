/**
 * The personal board. Every issue starts in the backlog; moving one to Todo puts it on your
 * board, and that is the only status anyone sets by hand. In progress and Done will follow
 * from workspace evidence, never from moving cards. Stored on this device only.
 */
import type { IssueSummary as Issue } from "./library";

export const BOARD_KEY = "muscle-memory.board";
/** More than this many in Todo gets a gentle nudge, not a block. */
export const TODO_LIMIT = 3;

export interface BoardItem {
  /** Permanent issue key such as API-2. */
  key: string;
  /** When it moved from the backlog to Todo. */
  addedAt: string;
}

export type Status = "backlog" | "todo" | "in-progress" | "done";
/** Board columns, left to right. The backlog is the issue list itself. */
export const COLUMNS: readonly Status[] = ["todo", "in-progress", "done"];
export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  done: "Done",
};

const KEY = /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/;

/** Reads the stored board, dropping anything malformed rather than failing. */
export function parseBoard(raw: string | null): BoardItem[] {
  try {
    const value = JSON.parse(raw ?? "null") as { items?: unknown };
    if (!value || !Array.isArray(value.items)) return [];
    const seen = new Set<string>();
    return value.items.filter((item): item is BoardItem => {
      const ok =
        !!item &&
        typeof item.key === "string" &&
        KEY.test(item.key) &&
        typeof item.addedAt === "string" &&
        !seen.has(item.key);
      if (ok) seen.add(item.key);
      return ok;
    });
  } catch {
    return [];
  }
}

export function serializeBoard(items: readonly BoardItem[]): string {
  return JSON.stringify({ version: 1, items });
}

export function moveToTodo(
  items: readonly BoardItem[],
  key: string,
  at: string,
): BoardItem[] {
  return items.some((i) => i.key === key)
    ? [...items]
    : [...items, { key, addedAt: at }];
}

export function moveToBacklog(
  items: readonly BoardItem[],
  key: string,
): BoardItem[] {
  return items.filter((i) => i.key !== key);
}

/** Whether adding one more to Todo would go over the soft limit. */
export function todoFull(items: readonly BoardItem[]): boolean {
  return items.length >= TODO_LIMIT;
}

/** On the board means Todo until workspace evidence moves it; everything else is backlog. */
export function statusOf(items: readonly BoardItem[], key: string): Status {
  return items.some((i) => i.key === key) ? "todo" : "backlog";
}

/** Issues on the board that still exist, in the order they were added. */
export function boardIssues(
  items: readonly BoardItem[],
  issues: readonly Issue[],
): { issue: Issue; status: Status }[] {
  return items.flatMap((item) => {
    const issue = issues.find((i) => i.key === item.key);
    return issue ? [{ issue, status: statusOf(items, issue.key) }] : [];
  });
}

/** Backlog issues worth moving to Todo: runnable first, then the person's stack, then easiest. */
export function suggestions(
  issues: readonly Issue[],
  items: readonly BoardItem[],
  languages: readonly string[],
  count = 3,
): Issue[] {
  const rank = ["warm-up", "easy", "medium", "hard"];
  const score = (i: Issue) =>
    (i.runnable ? 0 : 100) +
    (i.language && languages.includes(i.language) ? 0 : 10) +
    (i.difficulty ? rank.indexOf(i.difficulty) : 4);
  return issues
    .filter((i) => !items.some((item) => item.key === i.key))
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => score(a.issue) - score(b.issue) || a.index - b.index)
    .slice(0, count)
    .map(({ issue }) => issue);
}
