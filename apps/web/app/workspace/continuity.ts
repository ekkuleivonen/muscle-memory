/**
 * Where someone was in the IDE, so leaving it (for the pull request, the ticket, another tab,
 * a reload or the next day) and coming back puts them where they were: the open tabs, the file
 * shown, the side bar and panel, and each editable file's cursor, selection and scroll. The code
 * itself comes from the recorded edits (packages/capture/restore.ts); this is only the view, kept
 * per participant and attempt so replays never inherit another attempt's place.
 *
 * Kept locally, never recorded or uploaded. Restoring the view adds no analytics event.
 */
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const WORKSPACE_VIEW_KEY = "muscle-memory.workspace-view";
/** Views kept, most recent first; older attempts' places are forgotten. */
const KEPT = 20;

export type SideView = "ticket" | "explorer";
export type PanelView = "tests" | "output" | "pulls";

export interface FileView {
  /** CodeMirror's selection as JSON: ranges of anchor and head, and the main range. */
  readonly ranges: readonly {
    readonly anchor: number;
    readonly head: number;
  }[];
  readonly main: number;
  /** The first line in view, 1-based. */
  readonly topLine: number;
}

export interface WorkspaceView {
  /** The issue and attempt it belongs to: see viewScope. */
  readonly scope: string;
  readonly tabs: readonly string[];
  readonly active: string;
  readonly side: SideView;
  readonly panel: PanelView;
  readonly files: Readonly<Record<string, FileView>>;
  readonly savedAt: string;
}

/** One attempt at one issue: the issue's id and when the attempt began (null for the first). */
export function viewScope(issue: string, attemptStart: string | null): string {
  return `${issue}@${attemptStart ?? "first"}`;
}

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function parseFile(value: unknown): FileView | null {
  const v = value as Partial<FileView> | null;
  if (!v || !Array.isArray(v.ranges) || !v.ranges.length) return null;
  if (!v.ranges.every((r) => r && isCount(r.anchor) && isCount(r.head)))
    return null;
  if (!isCount(v.main) || v.main >= v.ranges.length || !isCount(v.topLine))
    return null;
  return {
    ranges: v.ranges.map((r) => ({ anchor: r.anchor, head: r.head })),
    main: v.main,
    topLine: Math.max(1, v.topLine),
  };
}

function parseView(value: unknown): WorkspaceView | null {
  const v = value as Partial<WorkspaceView> | null;
  if (
    !v ||
    typeof v.scope !== "string" ||
    !Array.isArray(v.tabs) ||
    !v.tabs.every((t) => typeof t === "string") ||
    typeof v.active !== "string" ||
    (v.side !== "ticket" && v.side !== "explorer") ||
    (v.panel !== "tests" && v.panel !== "output" && v.panel !== "pulls") ||
    typeof v.savedAt !== "string" ||
    !v.files ||
    typeof v.files !== "object"
  )
    return null;
  const files: Record<string, FileView> = {};
  for (const [path, file] of Object.entries(v.files)) {
    const parsed = parseFile(file);
    if (parsed) files[path] = parsed;
  }
  return {
    scope: v.scope,
    tabs: [...v.tabs],
    active: v.active,
    side: v.side,
    panel: v.panel,
    files,
    savedAt: v.savedAt,
  };
}

/** Every stored view, most recent first; anything unreadable is dropped. */
export function parseViews(raw: string | null): WorkspaceView[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? value.flatMap((v) => {
          const parsed = parseView(v);
          return parsed ? [parsed] : [];
        })
      : [];
  } catch {
    return [];
  }
}

/** The stored views with `view` in place of its scope's, most recent first, at most KEPT. */
export function withView(
  views: readonly WorkspaceView[],
  view: WorkspaceView,
): WorkspaceView[] {
  return [view, ...views.filter((v) => v.scope !== view.scope)].slice(0, KEPT);
}

/**
 * The saved view as it fits the repo now: files the revision no longer has are dropped, every
 * editable file and the tests stay open, and positions are clamped to each file's length.
 */
export function fitView(
  view: WorkspaceView,
  repo: {
    /** Every path in the repo. */
    readonly paths: readonly string[];
    /** The tabs the IDE always opens with, in its order. */
    readonly tabs: readonly string[];
    /** Editable files' current lengths, by path. */
    readonly lengths: Readonly<Record<string, number>>;
  },
): Omit<WorkspaceView, "scope" | "savedAt"> {
  const known = new Set(repo.paths);
  const tabs = [
    ...view.tabs.filter((p) => known.has(p)),
    ...repo.tabs.filter((p) => !view.tabs.includes(p)),
  ].filter((p, i, all) => all.indexOf(p) === i);
  const files: Record<string, FileView> = {};
  for (const [path, file] of Object.entries(view.files)) {
    const length = repo.lengths[path];
    if (length === undefined) continue;
    const clamp = (n: number) => Math.min(n, length);
    files[path] = {
      ranges: file.ranges.map((r) => ({
        anchor: clamp(r.anchor),
        head: clamp(r.head),
      })),
      main: file.main,
      topLine: file.topLine,
    };
  }
  return {
    tabs,
    active: tabs.includes(view.active) ? view.active : repo.tabs[0],
    side: view.side,
    panel: view.panel,
    files,
  };
}

/** The saved view for one attempt, or null. Call after mount: it reads localStorage. */
export function readView(scope: string): WorkspaceView | null {
  try {
    return (
      parseViews(localStorage.getItem(WORKSPACE_VIEW_KEY)).find(
        (v) => v.scope === scope,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Whether any attempt at this issue has a saved view: the person is coming back to it. */
export function hasView(issue: string): boolean {
  try {
    return parseViews(localStorage.getItem(WORKSPACE_VIEW_KEY)).some((v) =>
      v.scope.startsWith(`${issue}@`),
    );
  } catch {
    return false;
  }
}

export function writeView(view: WorkspaceView): void {
  try {
    localStorage.setItem(
      WORKSPACE_VIEW_KEY,
      JSON.stringify(
        withView(parseViews(localStorage.getItem(WORKSPACE_VIEW_KEY)), view),
      ),
    );
  } catch {
    // Storage full or blocked: coming back opens at the top of the file, as before.
  }
}

/** An editor's place: its selection and the first line in view. */
export function fileViewOf(view: EditorView): FileView {
  const { ranges, mainIndex } = view.state.selection;
  const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  return {
    ranges: ranges.map((r) => ({ anchor: r.anchor, head: r.head })),
    main: mainIndex,
    topLine: view.state.doc.lineAt(top.from).number,
  };
}

/**
 * Puts an editor back where it was. The session suppresses restoration activity.
 */
export function restoreFileView(view: EditorView, file: FileView): void {
  const { doc } = view.state;
  const clamp = (n: number) => Math.min(n, doc.length);
  const line = doc.line(Math.min(file.topLine, doc.lines));
  view.dispatch({
    selection: EditorSelection.create(
      file.ranges.map((r) =>
        EditorSelection.range(clamp(r.anchor), clamp(r.head)),
      ),
      file.main,
    ),
    effects: EditorView.scrollIntoView(line.from, { y: "start" }),
  });
  // The selected file now has a layout box. Set its position immediately as well as
  // asking CodeMirror to refine it after measurement; persistence must not see zero.
  view.scrollDOM.scrollTop = view.lineBlockAt(line.from).top;
}
