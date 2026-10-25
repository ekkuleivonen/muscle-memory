"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

const LAYOUT_KEY = "muscle-memory.practice-layout";

/** The challenge pane's width and the feedback pane's height, in px. */
export const CHALLENGE = { min: 240 };
export const FEEDBACK = { min: 80 };
/** What the code pane keeps when the others grow. */
export const CODE_MIN = { width: 360, height: 140 };

/** Pane sizes as last dragged; null keeps the stylesheet's proportional default. */
export interface PracticeLayout {
  challenge: number | null;
  feedback: number | null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Pane sizes, remembered on this device; never recorded (a declared capture gap). */
export function usePracticeLayout() {
  const [layout, setLayout] = useState<PracticeLayout>({
    challenge: null,
    feedback: null,
  });
  // Read after mount, so the server render and hydration agree.
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(LAYOUT_KEY) ?? "null",
      ) as Partial<PracticeLayout> | null;
      setLayout({
        challenge:
          typeof saved?.challenge === "number" ? saved.challenge : null,
        feedback: typeof saved?.feedback === "number" ? saved.feedback : null,
      });
    } catch {
      // A broken saved layout just means the defaults.
    }
  }, []);
  const update = (change: Partial<PracticeLayout>) =>
    setLayout((current) => {
      const next = { ...current, ...change };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        // Unsaved sizes still apply for this visit.
      }
      return next;
    });
  return { layout, update };
}

/**
 * A drag handle between two panes. `axis` x resizes a width (dragging right grows it), y a
 * height measured from below (dragging up grows it). Arrow keys nudge it (Shift for more),
 * Home and End go to the limits, Enter or double-click resets to the default.
 */
export function Splitter({
  axis,
  value,
  min,
  max,
  label,
  controls,
  onChange,
  onReset,
  className = "",
}: {
  axis: "x" | "y";
  /** The size now, measured: the pane may still be at its stylesheet default. */
  value(): number;
  min: number;
  max(): number;
  label: string;
  controls: string;
  onChange(value: number): void;
  onReset(): void;
  className?: string;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [range, setRange] = useState({ value: min, max: min });
  useEffect(() => {
    const measure = () => {
      const upper = Math.max(min, Math.round(max()));
      const current = clamp(value(), min, upper);
      setRange((previous) =>
        previous.value === current && previous.max === upper
          ? previous
          : { value: current, max: upper },
      );
    };
    const observer = new ResizeObserver(measure);
    const pane = document.getElementById(controls);
    if (pane) observer.observe(pane);
    if (handle.current?.parentElement)
      observer.observe(handle.current.parentElement);
    measure();
    return () => observer.disconnect();
  }, [controls, min, max, value]);
  const set = (next: number) =>
    onChange(clamp(next, min, Math.max(min, max())));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // preventDefault stops text selection, and with it the usual focus on click.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: axis === "x" ? event.clientX : event.clientY,
      value: value(),
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
    if (event.key === grow) set(value() + step);
    else if (event.key === shrink) set(value() - step);
    else if (event.key === "Home") set(min);
    else if (event.key === "End") set(max());
    else if (event.key === "Enter") onReset();
    else return;
    event.preventDefault();
  }

  return (
    <div
      ref={handle}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-controls={controls}
      aria-valuemin={min}
      aria-valuemax={range.max}
      aria-valuenow={range.value}
      aria-valuetext={`${range.value} pixels`}
      aria-description="Arrow keys resize. Shift moves faster. Home and End move to the limits. Enter resets."
      tabIndex={0}
      title="Drag or arrow keys to resize · Enter or double-click to reset"
      className={`pane-splitter ${axis} ${dragging ? "dragging" : ""} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
