"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const LAYOUT_KEY = "muscle-memory.ide-layout";

export const SIDE = { initial: 280, min: 180, max: 560 };
export const PANEL = { initial: 260, min: 90 };
/** The editor keeps at least this much height when the panel grows. */
const EDITOR_MIN = 120;
/** The tab strip and breadcrumbs above the editor. */
const EDITOR_CHROME = 60;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Sidebar width and panel height, remembered on this device like VS Code does. */
export function useIdeLayout() {
  const [side, setSide] = useState(SIDE.initial);
  const [panel, setPanel] = useState(PANEL.initial);
  // Read after mount, so the server render and hydration agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as {
        side?: number;
        panel?: number;
      } | null;
      if (typeof saved?.side === "number")
        setSide(clamp(saved.side, SIDE.min, SIDE.max));
      if (typeof saved?.panel === "number")
        setPanel(Math.max(PANEL.min, Math.round(saved.panel)));
    } catch {
      // A broken saved layout just means the defaults.
    }
  }, []);
  const save = (next: { side: number; panel: number }) =>
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  return {
    side,
    panel,
    setSide: (value: number) => {
      setSide(value);
      save({ side: value, panel });
    },
    setPanel: (value: number) => {
      setPanel(value);
      save({ side, panel: value });
    },
  };
}

/** The panel's largest height inside a main area of `height` px. */
export function panelMax(height: number): number {
  return Math.max(PANEL.min, height - EDITOR_CHROME - EDITOR_MIN);
}

/**
 * A drag handle between two areas. `axis` x resizes a width (dragging right grows it), y a
 * height measured from below (dragging up grows it). Arrow keys nudge it; double-click resets.
 */
export function Splitter({
  axis,
  value,
  min,
  max,
  initial,
  label,
  onChange,
  className = "",
}: {
  axis: "x" | "y";
  value: number;
  min: number;
  max: () => number;
  initial: number;
  label: string;
  onChange(value: number): void;
  className?: string;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const set = (next: number) => onChange(clamp(next, min, max()));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // preventDefault stops text selection, and with it the usual focus on click.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: axis === "x" ? event.clientX : event.clientY,
      value,
    };
    setDragging(true);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const moved =
      (axis === "x" ? event.clientX : event.clientY) - drag.current.start;
    set(drag.current.value + (axis === "x" ? moved : -moved));
  }
  function onPointerUp() {
    drag.current = null;
    setDragging(false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 16;
    const grow = axis === "x" ? "ArrowRight" : "ArrowUp";
    const shrink = axis === "x" ? "ArrowLeft" : "ArrowDown";
    if (event.key === grow) set(value + step);
    else if (event.key === shrink) set(value - step);
    else if (event.key === "Home") set(min);
    else if (event.key === "End") set(max());
    else return;
    event.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      tabIndex={0}
      title={`Drag to resize · double-click to reset`}
      className={`ide-splitter ${axis} ${dragging ? "dragging" : ""} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => set(initial)}
      onKeyDown={onKeyDown}
    />
  );
}
