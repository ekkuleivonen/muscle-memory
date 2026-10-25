"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { initialList, listKey, type Prompt } from "./prompts";

export interface KeyMenuItem {
  href: string;
  name: string;
  hint: string;
  /** Printed above the first item of each group. */
  group?: string;
}

/**
 * A list of pages to open, driven like a terminal prompt and clicked like a page: ↑↓ or j/k
 * move the ❯, Enter or a digit opens, hovering moves it too. Every row is a real link. Takes
 * the keyboard on load, so the keys work at once.
 */
export function KeyMenu({
  id,
  label,
  items,
}: {
  id: string;
  label: string;
  items: readonly KeyMenuItem[];
}) {
  const router = useRouter();
  const [state, setState] = useState(initialList);
  const list = useRef<HTMLDivElement>(null);
  const width = Math.max(...items.map((item) => item.name.length));
  const prompt: Extract<Prompt, { kind: "select" }> = {
    kind: "select",
    id,
    message: label,
    choices: items.map((item) => ({ value: item.href, label: item.name })),
  };

  useEffect(() => list.current?.focus({ preventScroll: true }), []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const result = listKey(prompt, state, event.key);
    if (result.type === "ignore") return;
    event.preventDefault();
    if (result.type === "state") setState(result.state);
    else router.push(String(result.value));
  }

  return (
    <nav aria-label={label}>
      <div
        ref={list}
        className="t-keymenu"
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${state.cursor}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {items.map((item, index) => {
          const current = index === state.cursor;
          const heading =
            item.group && item.group !== items[index - 1]?.group ? (
              <div className="t-group" aria-hidden>
                {item.group}
              </div>
            ) : null;
          return (
            <Fragment key={item.href}>
              {heading}
              <Link
                id={`${id}-${index}`}
                role="option"
                aria-selected={current}
                href={item.href}
                tabIndex={-1}
                className={`t-row${current ? " t-current-row" : ""}`}
                onMouseEnter={() => setState({ ...state, cursor: index })}
              >
                <span className="t-accent">{current ? "❯" : " "}</span>
                <span className="t-dim">{index + 1}.</span>
                <span className="t-row-name">{item.name.padEnd(width)}</span>
                <span className="t-dim">{item.hint}</span>
              </Link>
            </Fragment>
          );
        })}
      </div>
      <p className="t-line t-dim t-keys">↑↓ move · enter opens · or click</p>
    </nav>
  );
}
