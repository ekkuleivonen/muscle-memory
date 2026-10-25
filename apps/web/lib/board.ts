/**
 * The personal board. Every issue starts in the backlog. People set Backlog, Todo or In
 * progress from an issue's Status menu; Done is never set by hand: a run that passes every
 * acceptance check puts the issue there, for good. Stored on this device only.
 */
import { ISSUE_KEY } from "../../../packages/domain/board";

export const BOARD_KEY = "muscle-memory.board";
/** Same-tab change notice; other tabs hear the storage event. */
export const BOARD_CHANGE = "muscle-memory:board";

export type Status = "backlog" | "todo" | "in-progress" | "done";
/** Statuses people can choose; Done comes only from passing every check. */
export type ManualStatus = Exclude<Status, "done">;
export const MANUAL_STATUSES: readonly ManualStatus[] = [
  "backlog",
  "todo",
  "in-progress",
];

export interface BoardItem {
  /** Permanent issue key such as PHP-002. */
  key: string;
  /** When it left the backlog. */
  addedAt: string;
  status: Exclude<Status, "backlog">;
  /** When every check first passed. */
  doneAt?: string;
}
/** Board columns, left to right. The backlog is the issue list itself. */
export const COLUMNS: readonly Status[] = ["todo", "in-progress", "done"];

/** Reads the stored board, dropping anything malformed rather than failing. */
export function parseBoard(raw: string | null): BoardItem[] {
  try {
    const value = JSON.parse(raw ?? "null") as { items?: unknown };
    if (!value || !Array.isArray(value.items)) return [];
    const seen = new Set<string>();
    return value.items
      .filter((item): item is BoardItem => {
        const ok =
          !!item &&
          typeof item.key === "string" &&
          ISSUE_KEY.test(item.key) &&
          typeof item.addedAt === "string" &&
          (item.status === undefined ||
            item.status === "todo" ||
            item.status === "in-progress" ||
            (item.status === "done" && typeof item.doneAt === "string")) &&
          !seen.has(item.key);
        if (ok) seen.add(item.key);
        return ok;
      })
      .map((item) => ({
        key: item.key,
        addedAt: item.addedAt,
        // Boards saved before statuses existed only held Todo.
        status: item.status ?? "todo",
        ...(item.status === "done" ? { doneAt: item.doneAt } : {}),
      }));
  } catch {
    return [];
  }
}

export function serializeBoard(items: readonly BoardItem[]): string {
  return JSON.stringify({ version: 1, items });
}

/**
 * Sets a status by hand. Backlog takes the issue off the board; Done is refused, and a done
 * issue stays done.
 */
export function setStatus(
  items: readonly BoardItem[],
  key: string,
  status: ManualStatus,
  at: string,
): BoardItem[] {
  if (!MANUAL_STATUSES.includes(status))
    throw new Error("Done is set by passing every acceptance check.");
  const existing = items.find((i) => i.key === key);
  if (existing?.status === "done") return [...items];
  if (status === "backlog") return items.filter((i) => i.key !== key);
  return existing
    ? items.map((i) => (i.key === key ? { ...i, status } : i))
    : [...items, { key, addedAt: at, status }];
}

/** Every check passed: the issue moves to Done, wherever it was. Done stays done. */
export function complete(
  items: readonly BoardItem[],
  key: string,
  at: string,
): BoardItem[] {
  const existing = items.find((i) => i.key === key);
  if (existing?.status === "done") return [...items];
  const done = { status: "done" as const, doneAt: at };
  return existing
    ? items.map((i) => (i.key === key ? { ...i, ...done } : i))
    : [...items, { key, addedAt: at, ...done }];
}

/** Issues being worked on: Todo and In progress, not Done. */
export function activeCount(items: readonly BoardItem[]): number {
  return items.filter((i) => i.status !== "done").length;
}

export function statusOf(items: readonly BoardItem[], key: string): Status {
  return items.find((i) => i.key === key)?.status ?? "backlog";
}
