"use client";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { engineFor, warmRuntime } from "../../../../packages/runner/runner";
import { statusOf } from "../../lib/board";
import {
  DIFFICULTIES,
  KINDS,
  languageLabel,
  type Issue,
} from "../../lib/library";
import {
  filterByMarks,
  filterIssues,
  formatQuery,
  parseIssueQuery,
  toggle,
  type IssueQuery,
  type ListKey,
  type Mark,
} from "../../lib/queries";
import {
  parseStars,
  STARS_CHANGE,
  STARS_KEY,
  toggleStar,
  writeStars,
} from "../../lib/stars";
import { useBoard } from "../(browse)/_components/board";
import { ChallengeExamples } from "../(browse)/_components/challenge-examples";
import { Markdown } from "../(browse)/_components/markdown";

/** A challenge as the picker lists, searches and previews it. */
export type PickerChallenge = Issue;

/** How many topics get a toggle; the rest match when typed. */
const TOPICS = 10;

function subscribeStars(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STARS_CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STARS_CHANGE, onChange);
  };
}

/** Starred keys in this browser, kept in sync across tabs. */
function useStars(): string[] {
  const raw = useSyncExternalStore(
    subscribeStars,
    () => localStorage.getItem(STARS_KEY),
    () => null,
  );
  return useMemo(() => parseStars(raw), [raw]);
}

/**
 * The challenge picker: type to narrow (plain words, or lang: difficulty: kind: label:, and
 * is:starred or is:completed), click the filter toggles, move with ↑↓ (or Ctrl-n/p), Ctrl-s
 * stars, Enter starts practice. Completed is a verified completion (the board's done). Easiest first
 * unless the search says sort:. The search line is mirrored into the URL.
 */
export function Picker({
  challengesJson,
  initialQuery,
}: {
  challengesJson: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const all = useMemo(
    () => JSON.parse(challengesJson) as PickerChallenge[],
    [challengesJson],
  );
  const board = useBoard();
  const stars = useStars();
  const has = (key: string, mark: Mark) =>
    mark === "starred"
      ? stars.includes(key)
      : statusOf(board.items, key) === "done";
  const [text, setText] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);

  const query = useMemo(() => parseIssueQuery(text), [text]);
  const results = useMemo(() => {
    // Easiest first, unless the search asks for another order.
    const ordered = /(^|\s)sort:/.test(text)
      ? query
      : { ...query, sort: "difficulty" as const };
    return filterByMarks(filterIssues(all, ordered), query.marks, has);
  }, [all, query, text, board.items, stars]);
  const at = Math.min(cursor, Math.max(0, results.length - 1));
  const current = results[at];

  const facets = useMemo(() => {
    const count = new Map<string, number>();
    for (const issue of all)
      for (const label of issue.labels)
        count.set(label, (count.get(label) ?? 0) + 1);
    const present = <T,>(
      values: readonly T[],
      of: (i: Issue) => T | undefined,
    ) => values.filter((value) => all.some((issue) => of(issue) === value));
    return [
      {
        name: "mine",
        key: "marks" as ListKey,
        values: [
          { value: "starred", label: "★ starred" },
          { value: "completed", label: "✔ completed" },
        ],
      },
      {
        name: "lang",
        key: "language" as ListKey,
        values: [...new Set(all.map((i) => i.language).filter(Boolean))].map(
          (id) => ({ value: id!, label: languageLabel(id).toLowerCase() }),
        ),
      },
      {
        name: "level",
        key: "difficulty" as ListKey,
        values: present(DIFFICULTIES, (i) => i.difficulty).map((d) => ({
          value: d,
          label: d,
        })),
      },
      {
        name: "kind",
        key: "kind" as ListKey,
        values: present(KINDS, (i) => i.kind).map((k) => ({
          value: k,
          label: k,
        })),
      },
      {
        name: "topic",
        key: "label" as ListKey,
        values: [...count.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, TOPICS)
          .map(([label]) => ({ value: label, label })),
      },
    ];
  }, [all]);

  // The search line lives in the URL, so a search can be linked or reloaded.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim();
      router.replace(
        q ? `/challenges?q=${encodeURIComponent(q)}` : "/challenges",
        {
          scroll: false,
        },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [text, router]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${at}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [at]);

  // "/" finds the search from anywhere on the page, as before.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || document.activeElement === input.current) return;
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const search = (next: string) => {
    setText(next);
    setCursor(0);
  };
  const flip = (key: ListKey, value: string) => {
    search(formatQuery(toggle(query, key, value) as IssueQuery));
    input.current?.focus();
  };
  /** Starting is a board move to In progress, recorded as before, then practice. */
  const start = (issue: PickerChallenge, via: "keyboard" | "pointer") => {
    board.move(issue, "in-progress", via, { trigger: "start-work" });
    router.push(`/work/${issue.key}`);
  };
  const star = (issue: PickerChallenge) =>
    writeStars(toggleStar(stars, issue.key));
  const warm = (issue: PickerChallenge) => {
    const engine = issue.language && engineFor(issue.language);
    if (engine) warmRuntime(engine);
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const move = (by: number) => {
      event.preventDefault();
      setCursor(Math.min(results.length - 1, Math.max(0, at + by)));
    };
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === "ArrowDown" || (ctrl && event.key === "n")) move(1);
    else if (event.key === "ArrowUp" || (ctrl && event.key === "p")) move(-1);
    else if (event.key === "PageDown") move(10);
    else if (event.key === "PageUp") move(-10);
    else if (ctrl && event.key === "s" && current) {
      event.preventDefault();
      star(current);
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      start(current, "keyboard");
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (text) search("");
      else input.current?.blur();
    }
  }

  return (
    <div className="term picker">
      <div className="picker-search">
        <label className="picker-line">
          <span className="t-accent" aria-hidden>
            &gt;
          </span>
          <input
            ref={input}
            autoFocus
            value={text}
            onChange={(event) => search(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search: words, or lang:python difficulty:easy is:starred"
            aria-label="Search challenges"
            aria-controls="picker-list"
            aria-activedescendant={current ? `pick-${current.key}` : undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="t-dim">
            {results.length} of {all.length}
          </span>
        </label>
        {facets.map((facet) => (
          <div key={facet.name} className="picker-facet">
            <span className="t-dim">{facet.name}</span>
            {facet.values.map(({ value, label }) => {
              const on = (query as unknown as Record<ListKey, string[]>)[
                facet.key
              ].includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  className={on ? "on" : undefined}
                  onClick={() => flip(facet.key, value)}
                >
                  {on ? `[${label}]` : label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="picker-main">
        <ol
          ref={list}
          id="picker-list"
          className="picker-list"
          role="listbox"
          aria-label="Challenges"
        >
          {results.map((issue, index) => {
            const starred = has(issue.key, "starred");
            const completed = has(issue.key, "completed");
            return (
              <li
                key={issue.key}
                id={`pick-${issue.key}`}
                data-index={index}
                role="option"
                aria-selected={index === at}
                className={index === at ? "t-current-row" : undefined}
                onClick={() => setCursor(index)}
                onDoubleClick={() => start(issue, "pointer")}
              >
                <span className="t-accent">{index === at ? "❯" : " "}</span>
                <span
                  className="picker-mark starred"
                  title={starred ? "starred" : undefined}
                >
                  {starred ? "★" : " "}
                </span>
                <span
                  className="picker-mark completed"
                  title={completed ? "completed" : undefined}
                >
                  {completed ? "✔" : " "}
                </span>
                <span className="picker-key t-dim">{issue.key}</span>
                <span className="picker-title">{issue.title}</span>
                <span className="t-dim picker-meta">
                  {languageLabel(issue.language).toLowerCase()} ·{" "}
                  {issue.difficulty}
                </span>
              </li>
            );
          })}
          {!results.length && (
            <li className="t-dim picker-empty">
              Nothing matches. Esc clears the search.
            </li>
          )}
        </ol>
        <aside className="picker-preview" aria-label="Preview">
          {current && (
            <>
              <h1 className="t-doc-title">{current.title}</h1>
              <p className="t-dim">
                {current.key} · {languageLabel(current.language).toLowerCase()}{" "}
                · {current.difficulty} · {current.kind}
                {current.labels.length > 0 && ` · ${current.labels.join(", ")}`}
              </p>
              <button
                type="button"
                className="t-row t-action t-primary t-current-row picker-start"
                onClick={() => start(current, "pointer")}
                onPointerEnter={() => warm(current)}
                onFocus={() => warm(current)}
              >
                <span className="t-accent">❯</span>
                <span className="t-row-name">start practice</span>
                <span className="t-dim">(enter)</span>
              </button>
              <button
                type="button"
                className="t-row t-action picker-star"
                aria-pressed={has(current.key, "starred")}
                onClick={() => star(current)}
              >
                <span className="t-accent"> </span>
                <span className="t-row-name">
                  {has(current.key, "starred") ? "★ starred" : "☆ star"}
                </span>
                <span className="t-dim">(ctrl-s)</span>
              </button>
              {has(current.key, "completed") && (
                <p className="t-ok">✔ completed</p>
              )}
              <Markdown source={current.task} className="t-md" />
              <ChallengeExamples examples={current.criteria} compact />
            </>
          )}
        </aside>
      </div>
      <p className="t-line t-dim picker-keys">
        ↑↓ move · enter practice · ctrl-s star · type to search · / search · esc
        clear
      </p>
    </div>
  );
}
