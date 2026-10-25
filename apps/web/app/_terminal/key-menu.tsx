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
  /** Opens something that can't be undone: the name reads in red. */
  danger?: boolean;
}

/**
 * A list of pages to open, driven like a terminal prompt and clicked like a page: ↑↓ or j/k
 * move the ❯, Enter or a digit opens. Hover only highlights. Every row is a real link. Takes
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
  // Runs of items under one heading, keeping each item's place in the whole list.
  const groups: {
    label?: string;
    rows: { item: KeyMenuItem; index: number }[];
  }[] = [];
  items.forEach((item, index) => {
    const last = groups.at(-1);
    if (last && last.label === item.group) last.rows.push({ item, index });
    else groups.push({ label: item.group, rows: [{ item, index }] });
  });
  const prompt: Extract<Prompt, { kind: "select" }> = {
    kind: "select",
    id,
    message: label,
    choices: items.map((item) => ({ value: item.href, label: item.name })),
  };

  useEffect(() => list.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (document.activeElement === list.current)
      document
        .getElementById(`${id}-${state.cursor}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [id, state.cursor]);

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
        {groups.map(({ label: group, rows }) => {
          const options = rows.map(({ item, index }) => {
            const current = index === state.cursor;
            return (
              <Link
                key={item.href}
                id={`${id}-${index}`}
                role="option"
                aria-selected={current}
                href={item.href}
                tabIndex={-1}
                className={`t-row${current ? " t-current-row" : ""}${item.danger ? " t-danger" : ""}`}
                onFocus={() => setState({ ...state, cursor: index })}
              >
                <span className="t-accent">{current ? "❯" : " "}</span>
                <span className="t-dim">{index + 1}.</span>
                <span className="t-row-name">{item.name.padEnd(width)}</span>
                <span className="t-dim">{item.hint}</span>
              </Link>
            );
          });
          if (!group) return <Fragment key={rows[0].index}>{options}</Fragment>;
          // The heading is the group's name for screen readers too, not only a printed line.
          const headingId = `${id}-group-${rows[0].index}`;
          return (
            <div key={rows[0].index} role="group" aria-labelledby={headingId}>
              <div className="t-group" id={headingId} role="presentation">
                {group}
              </div>
              {options}
            </div>
          );
        })}
      </div>
      <p className="t-line t-dim t-keys">↑↓ move · enter opens · or click</p>
    </nav>
  );
}
