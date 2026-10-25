"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { initialList, listKey, type Prompt } from "./prompts";

export interface MenuItem {
  href: string;
  label: string;
  hint?: string;
}

/**
 * A terminal menu of places to go, for pages that are read rather than run. Each option is a
 * real link (works without script, opens in a new tab on middle-click); keys are the settings
 * prompt's: ↑↓ or j/k move, Enter opens, a digit opens its option.
 */
export function LinkMenu({
  id,
  message,
  items,
  autoFocus = false,
}: {
  id: string;
  message: string;
  items: readonly MenuItem[];
  /** Takes the keyboard on load, for the page's main menu. */
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialList);
  const list = useRef<HTMLUListElement>(null);
  const width = Math.max(...items.map((item) => item.label.length));
  const prompt: Extract<Prompt, { kind: "select" }> = {
    kind: "select",
    id,
    message,
    choices: items.map((item) => ({ value: item.href, label: item.label })),
  };

  useEffect(() => {
    if (autoFocus) list.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const result = listKey(prompt, state, event.key);
    if (result.type === "ignore") return;
    event.preventDefault();
    if (result.type === "state") setState(result.state);
    else router.push(String(result.value));
  }

  return (
    <nav aria-label={message}>
      <div className="t-line">
        <span className="t-accent">?</span> <strong>{message}</strong>
      </div>
      <ul
        ref={list}
        className="t-list"
        tabIndex={0}
        aria-activedescendant={`${id}-${state.cursor}`}
        onKeyDown={onKeyDown}
      >
        {items.map((item, index) => {
          const current = index === state.cursor;
          return (
            <li
              key={item.href}
              id={`${id}-${index}`}
              className={current ? "t-current" : undefined}
              onMouseEnter={() => setState({ ...state, cursor: index })}
            >
              <Link href={item.href} className="t-menu-link" tabIndex={-1}>
                <span className="t-accent">{current ? "❯" : " "}</span>{" "}
                <span className="t-dim">{index + 1}.</span>{" "}
                {item.label.padEnd(width)}
                {item.hint && <span className="t-dim"> — {item.hint}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="t-line t-dim">↑↓ move · enter opens · or click</div>
    </nav>
  );
}
