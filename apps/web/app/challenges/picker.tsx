"use client";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { engineFor, warmRuntime } from "../../../../packages/runner/runner";
import { DIFFICULTIES, languageLabel, type Challenge } from "../../lib/challenges";
import {
  filterByMarks,
  filterChallenges,
  formatQuery,
  parseChallengeQuery,
  toggle,
  type ChallengeQuery,
  type ListKey,
  type Mark,
} from "../../lib/queries";
import { toggleStar, writeStars } from "../../lib/stars";
import { practiceHref } from "../../lib/paths";
import { completed } from "../../lib/progress";
import { useProgress, useStars } from "../../lib/progress-hooks";
import { logStar } from "../../lib/site-log";
import { noteStart } from "../../lib/start";
import { ChallengeExamples } from "../_components/challenge-examples";
import { Markdown } from "../_components/markdown";


/** How many tags get a toggle; the rest match when typed. */
const TAGS = 10;

/**
 * The challenge picker: type to narrow (plain words, or lang: difficulty: tag:, and
 * is:starred or is:completed), click the filter toggles, move with ↑↓ (or Ctrl-n/p), Ctrl-s
 * stars, Enter starts practice. Completed: an attempt on this device passed every check. Easiest first
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
    () => JSON.parse(challengesJson) as Challenge[],
    [challengesJson],
  );
  const progress = useProgress();
  const stars = useStars();
  const has = (key: string, mark: Mark) =>
    mark === "starred" ? stars.includes(key) : completed(progress, key);
  const [text, setText] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const query = useMemo(() => parseChallengeQuery(text), [text]);
  const results = useMemo(() => {
    // Easiest first, unless the search asks for another order.
    const ordered = /(^|\s)sort:/.test(text)
      ? query
      : { ...query, sort: "difficulty" as const };
    return filterByMarks(filterChallenges(all, ordered), query.marks, has);
  }, [all, query, text, progress, stars]);
  const at = Math.min(cursor, Math.max(0, results.length - 1));
  const current = results[at];

  const facets = useMemo(() => {
    const count = new Map<string, number>();
    for (const challenge of all)
      for (const tag of challenge.tags) count.set(tag, (count.get(tag) ?? 0) + 1);
    const present = <T,>(
      values: readonly T[],
      of: (i: Challenge) => T | undefined,
    ) => values.filter((value) => all.some((challenge) => of(challenge) === value));
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
        name: "tag",
        key: "tag" as ListKey,
        values: [...count.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, TAGS)
          .map(([label]) => ({ value: label, label })),
      },
    ];
  }, [all]);

  // The search line lives in the URL, so a search can be linked or reloaded. The history API
  // updates it without asking the server to render the page (and every challenge) again;
  // usePathname and useSearchParams still see the change.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = text.trim();
      const href = q ? `/challenges?q=${encodeURIComponent(q)}` : "/challenges";
      if (href !== location.pathname + location.search)
        window.history.replaceState(null, "", href);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${at}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [at]);

  // Character shortcuts only act while this picker has focus.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || document.activeElement === input.current) return;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (!root.current?.contains(event.target as Node)) return;
      if (
        (event.target as HTMLElement).closest(
          "input, textarea, [contenteditable]",
        )
      )
        return;
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
    search(formatQuery(toggle(query, key, value) as ChallengeQuery));
  };
  /** Practice records the start, with the search then and the position in the list. */
  const start = (challenge: Challenge) => {
    noteStart({
      key: challenge.key,
      from: "picker",
      query: text.trim() || null,
      position: results.indexOf(challenge) + 1,
    });
    router.push(practiceHref(challenge.key));
  };
  const star = (challenge: Challenge) => {
    const starred = !stars.includes(challenge.key);
    writeStars(toggleStar(stars, challenge.key));
    void logStar(
      { key: challenge.key, revision: challenge.revision },
      starred,
      { from: "picker" },
    );
  };
  const warm = (challenge: Challenge) => {
    const engine = challenge.language && engineFor(challenge.language);
    if (engine) warmRuntime(engine);
  };

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
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
      start(current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (text) search("");
      else input.current?.blur();
    } else if (event.currentTarget === list.current && event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.currentTarget === list.current && event.key === "End") {
      event.preventDefault();
      setCursor(Math.max(0, results.length - 1));
    }
  }

  return (
    <div className="term picker" ref={root}>
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
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="picker-list"
            aria-activedescendant={current ? `pick-${current.key}` : undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="t-dim" role="status">
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
          aria-activedescendant={current ? `pick-${current.key}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {results.map((challenge, index) => {
            const starred = has(challenge.key, "starred");
            const completed = has(challenge.key, "completed");
            return (
              <li
                key={challenge.key}
                id={`pick-${challenge.key}`}
                data-index={index}
                role="option"
                aria-selected={index === at}
                className={index === at ? "t-current-row" : undefined}
                onClick={() => {
                  setCursor(index);
                  list.current?.focus({ preventScroll: true });
                }}
                onDoubleClick={() => start(challenge)}
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
                <span className="picker-key t-dim">{challenge.key}</span>
                <span className="picker-title">{challenge.title}</span>
                <span className="t-dim picker-meta">
                  {languageLabel(challenge.language).toLowerCase()} ·{" "}
                  {challenge.difficulty}
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
                · {current.difficulty}
                {current.tags.length > 0 && ` · ${current.tags.join(", ")}`}
              </p>
              <button
                type="button"
                className="t-row t-action t-primary t-current-row picker-start"
                onClick={() => start(current)}
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
