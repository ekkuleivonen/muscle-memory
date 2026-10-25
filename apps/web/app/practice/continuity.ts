/**
 * Where someone was in practice, so leaving it (for another page, another tab, a reload or the
 * next day) and coming back puts them where they were: the cursor, selection and scroll in the
 * file, and whether the output was open. The code itself comes from the recorded edits
 * (packages/capture/restore.ts); this is only the view, kept per participant and attempt so a
 * new attempt never inherits another's place.
 *
 * Kept locally, never recorded or uploaded. Restoring the view adds no observation.
 */
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const PRACTICE_VIEW_KEY = "muscle-memory.practice-view";
/** Views kept, most recent first; older attempts' places are forgotten. */
const KEPT = 20;

/** The cursor and selection (CodeMirror's ranges and the main one) and the first line in view. */
export interface Place {
  readonly ranges: readonly { readonly anchor: number; readonly head: number }[];
  readonly main: number;
  /** The first line in view, 1-based. */
  readonly topLine: number;
}

export interface PracticeView {
  /** The participant, challenge and attempt it belongs to. */
  readonly scope: string;
  readonly place: Place | null;
  readonly outputOpen: boolean;
  readonly savedAt: string;
}

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function parsePlace(value: unknown): Place | null {
  const v = value as Partial<Place> | null;
  if (!v || !Array.isArray(v.ranges) || !v.ranges.length) return null;
  if (!v.ranges.every((r) => r && isCount(r.anchor) && isCount(r.head))) return null;
  if (!isCount(v.main) || v.main >= v.ranges.length || !isCount(v.topLine)) return null;
  return {
    ranges: v.ranges.map((r) => ({ anchor: r.anchor, head: r.head })),
    main: v.main,
    topLine: Math.max(1, v.topLine),
  };
}

function parseView(value: unknown): PracticeView | null {
  const v = value as Partial<PracticeView> | null;
  if (!v || typeof v.scope !== "string" || typeof v.savedAt !== "string") return null;
  return {
    scope: v.scope,
    place: parsePlace(v.place),
    outputOpen: v.outputOpen === true,
    savedAt: v.savedAt,
  };
}

/** Every stored view, most recent first; anything unreadable is dropped. */
export function parseViews(raw: string | null): PracticeView[] {
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
export function withView(views: readonly PracticeView[], view: PracticeView): PracticeView[] {
  return [view, ...views.filter((v) => v.scope !== view.scope)].slice(0, KEPT);
}

/** A saved place clamped to the code's length now, so it always fits. */
export function fitPlace(place: Place, length: number): Place {
  const clamp = (n: number) => Math.min(n, length);
  return {
    ranges: place.ranges.map((r) => ({ anchor: clamp(r.anchor), head: clamp(r.head) })),
    main: place.main,
    topLine: place.topLine,
  };
}

/** The saved view for one attempt, or null. Call after mount: it reads localStorage. */
export function readView(scope: string): PracticeView | null {
  try {
    return parseViews(localStorage.getItem(PRACTICE_VIEW_KEY)).find((v) => v.scope === scope) ?? null;
  } catch {
    return null;
  }
}

export function writeView(view: PracticeView): void {
  try {
    localStorage.setItem(
      PRACTICE_VIEW_KEY,
      JSON.stringify(withView(parseViews(localStorage.getItem(PRACTICE_VIEW_KEY)), view)),
    );
  } catch {
    // Storage full or blocked: coming back opens at the top of the file, as before.
  }
}

/** An editor's place: its selection and the first line in view. */
export function placeOf(view: EditorView): Place {
  const { ranges, mainIndex } = view.state.selection;
  const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
  return {
    ranges: ranges.map((r) => ({ anchor: r.anchor, head: r.head })),
    main: mainIndex,
    topLine: view.state.doc.lineAt(top.from).number,
  };
}

/** Puts an editor back where it was. The session suppresses restoration activity. */
export function restorePlace(view: EditorView, place: Place): void {
  const { doc } = view.state;
  const clamp = (n: number) => Math.min(n, doc.length);
  const line = doc.line(Math.min(place.topLine, doc.lines));
  view.dispatch({
    selection: EditorSelection.create(
      place.ranges.map((r) => EditorSelection.range(clamp(r.anchor), clamp(r.head))),
      place.main,
    ),
    effects: EditorView.scrollIntoView(line.from, { y: "start" }),
  });
  // Set the position immediately as well as asking CodeMirror to refine it after measurement;
  // persistence must not see zero.
  view.scrollDOM.scrollTop = view.lineBlockAt(line.from).top;
}
