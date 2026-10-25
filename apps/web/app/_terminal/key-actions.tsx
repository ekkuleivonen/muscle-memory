"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface KeyAction {
  label: string;
  run(): void;
  /** primary reads in the accent, danger in red. */
  kind?: "primary" | "danger" | "plain";
  /** Shown dimmed and skipped by Enter, with why beside it. */
  disabled?: string | false;
  /** A letter that runs it at once, as y and n answer (Y/n). */
  key?: string;
}

const MOVES: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  j: 1,
  l: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
  k: -1,
  h: -1,
};

/**
 * A page's actions as a terminal prompt's choices, run by key or by click: ↑↓ (or j/k, ←→,
 * h/l) move the ❯, Enter, Space or a digit runs, a letter runs its action, Esc goes back.
 * Every row is a button, so a click or a screen reader works too.
 */
export const KeyActions = forwardRef<
  { focus(): void },
  {
    id: string;
    /** A question above the choices, as `? Sure?` */
    message?: string;
    actions: readonly KeyAction[];
    autoFocus?: boolean;
    onEscape?(): void;
  }
>(function KeyActions({ id, message, actions, autoFocus, onEscape }, ref) {
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () =>
      list.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(),
  }));
  useEffect(() => {
    if (autoFocus)
      list.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [autoFocus, id]);
  // A shorter list (a confirm replacing the actions) keeps the cursor on a row.
  const at = Math.min(cursor, actions.length - 1);
  useEffect(() => {
    if (list.current?.contains(document.activeElement))
      document
        .getElementById(`${id}-${at}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [at, id]);
  const moveTo = (index: number) => {
    setCursor(index);
    document.getElementById(`${id}-${index}`)?.focus();
  };

  const run = (index: number) => {
    const action = actions[index];
    if (!action || action.disabled) return;
    setCursor(index);
    action.run();
  };

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const move = MOVES[event.key];
    let handled = true;
    if (move) moveTo((at + move + actions.length) % actions.length);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(actions.length - 1);
    else if (event.key === "Enter" || event.key === " ") run(at);
    else if (event.key === "Escape" && onEscape) onEscape();
    else if (/^[1-9]$/.test(event.key) && Number(event.key) <= actions.length)
      run(Number(event.key) - 1);
    else {
      const index = actions.findIndex(
        (action) => action.key && action.key === event.key.toLowerCase(),
      );
      if (index >= 0) run(index);
      else handled = false;
    }
    if (handled) event.preventDefault();
  }

  return (
    <div className="t-key-actions">
      {message && (
        <p className="t-line">
          <span className="t-accent">?</span> <strong>{message}</strong>
        </p>
      )}
      <div
        ref={list}
        role="toolbar"
        aria-label={message ?? "Actions"}
        aria-orientation="vertical"
        className="t-keymenu"
        onKeyDown={onKeyDown}
      >
        {actions.map((action, index) => {
          const current = index === at;
          return (
            <button
              key={`${id}-${index}`}
              id={`${id}-${index}`}
              type="button"
              tabIndex={current ? 0 : -1}
              aria-disabled={action.disabled ? true : undefined}
              className={`t-row t-action t-${action.kind ?? "plain"}${current ? " t-current-row" : ""}${action.disabled ? " t-disabled" : ""}`}
              onFocus={() => setCursor(index)}
              onClick={() => run(index)}
            >
              <span className="t-accent">{current ? "❯" : " "}</span>
              <span className="t-dim">{index + 1}.</span>
              <span className="t-row-name">{action.label}</span>
              {action.key && <span className="t-dim">({action.key})</span>}
              {action.disabled && (
                <span className="t-dim">— {action.disabled}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="t-line t-dim t-keys">
        {actions.length > 1 ? "↑↓ move · " : ""}enter runs
        {onEscape ? " · esc back" : ""} · or click
      </p>
    </div>
  );
});
