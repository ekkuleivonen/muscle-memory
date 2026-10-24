"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "../../lib/onboarding";
import {
  choose,
  confirmKey,
  formatAnswer,
  listKey,
  startState,
  submitMulti,
  type Answer,
  type ListResult,
  type ListState,
  type Prompt,
} from "./prompts";
import { describeProfile } from "./questions";

type Line = { id: number; node: ReactNode };
type Active =
  | { type: "busy" }
  | {
      type: "prompt";
      /** Distinguishes consecutive prompts so each starts fresh. */
      token: number;
      prompt: Prompt;
      resolve: (answer: Answer | null) => void;
    };

export interface AskOptions {
  /** How a skipped answer reads afterwards: "skipped" unless told otherwise. */
  skipped?: string;
  /** Replaces the usual "✔ question · answer" line, e.g. to echo a command. */
  echo?: (answer: Answer) => ReactNode;
}

/** What a script can do with the terminal it runs in. */
export interface TerminalApi {
  print(...nodes: ReactNode[]): void;
  /** Shows a prompt and resolves with its answer, or null when skipped with Esc. */
  ask(prompt: Prompt, options?: AskOptions): Promise<Answer | null>;
  /** Prints where it is going, then goes; the link is there if the push is slow. */
  go(path: string, label: string): void;
  /** Back to the page before, or home when there is none. */
  back(): void;
}

/**
 * A full-screen terminal that runs one script: onboarding or settings. Scripts print lines
 * and ask prompts; every prompt works by keyboard and by pointer.
 */
export function Terminal({
  title,
  screen,
  run,
}: {
  title: string;
  /** What the little laptop in the banner shows, up to 10 characters. */
  screen: string;
  run: (terminal: TerminalApi) => Promise<void>;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState<Active>({ type: "busy" });
  const nextId = useRef(0);
  const booted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  function print(...nodes: ReactNode[]) {
    setLines((current) => [
      ...current,
      ...nodes.map((node) => ({ id: nextId.current++, node })),
    ]);
  }

  function ask(prompt: Prompt, options: AskOptions = {}) {
    return new Promise<Answer | null>((resolve) =>
      setActive({
        type: "prompt",
        token: nextId.current++,
        prompt,
        resolve: (answer) => {
          setActive({ type: "busy" });
          print(
            answer === null ? (
              <span>
                <span className="t-dim">–</span> {prompt.message}{" "}
                <span className="t-dim">· {options.skipped ?? "skipped"}</span>
              </span>
            ) : options.echo ? (
              options.echo(answer)
            ) : (
              <span>
                <span className="t-ok">✔</span> {prompt.message}{" "}
                <span className="t-dim">·</span>{" "}
                <span className="t-accent">{formatAnswer(prompt, answer)}</span>
              </span>
            ),
          );
          resolve(answer);
        },
      }),
    );
  }

  function go(path: string, label: string) {
    print(
      "",
      <span>
        <span className="t-ok">✔</span> Opening{" "}
        <a className="t-cmd" href={path}>
          {label}
        </a>
        …
      </span>,
    );
    setTimeout(() => router.push(path), 900);
  }

  function back() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  useEffect(() => {
    // Strict Mode mounts twice in development; boot once.
    if (booted.current) return;
    booted.current = true;
    print(<Banner title={title} screen={screen} />);
    void run({ print, ask, go, back });
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines, active]);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>("[data-focus]")?.focus();
  }, [active]);

  return (
    <div
      ref={root}
      className="term"
      onClick={() => {
        // Clicking anywhere returns focus to the prompt, unless the click selected text.
        if (window.getSelection()?.toString()) return;
        root.current?.querySelector<HTMLElement>("[data-focus]")?.focus();
      }}
    >
      <div role="log" aria-live="polite" className="t-log">
        {lines.map((line) => (
          <div key={line.id} className="t-line">
            {line.node === "" ? " " : line.node}
          </div>
        ))}
      </div>
      {active.type === "prompt" && (
        <PromptView
          key={active.token}
          prompt={active.prompt}
          onDone={active.resolve}
        />
      )}
      <div ref={bottom} />
    </div>
  );
}

/** A small laptop with the name beside it; screen readers get the words only. */
function Banner({ title, screen }: { title: string; screen: string }) {
  const frame = (text: string) => <span className="t-dim">{text}</span>;
  return (
    <div className="t-banner">
      <span className="t-sr">muscle memory, {title}</span>
      <span aria-hidden>
        {frame(" .------------.")}
        {"\n"}
        {frame(" | ")}
        <span className="t-accent">{screen.slice(0, 10).padEnd(10)}</span>
        {frame(" |")}
        {"   "}
        <span className="t-brand">muscle memory</span>
        {"\n"}
        {frame(" |            |")}
        {"   "}
        <span className="t-dim">{title}</span>
        {"\n"}
        {frame(" '------------'")}
        {"\n"}
        {frame("/______________\\")}
      </span>
    </div>
  );
}

/** A link inside terminal output; `newTab` for pages read alongside, like the Terms. */
export function TermLink({
  href,
  children,
  newTab = false,
}: {
  href: string;
  children: ReactNode;
  newTab?: boolean;
}) {
  return (
    <a
      className="t-cmd"
      href={href}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/** The profile as aligned label/value lines. */
export function profileLines(profile: Profile): ReactNode[] {
  return describeProfile(profile).map(([label, text]) => (
    <span>
      <span className="t-dim">{`  ${label.padEnd(12)}`}</span>
      {text}
    </span>
  ));
}

function PromptView({
  prompt,
  onDone,
}: {
  prompt: Prompt;
  onDone(answer: Answer | null): void;
}) {
  const [state, setState] = useState<ListState>(() => startState(prompt));
  const [text, setText] = useState("");
  const escape = prompt.escape ?? "skips";
  function apply(result: ListResult) {
    if (result.type === "state") setState(result.state);
    if (result.type === "submit") onDone(result.value);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" || (event.ctrlKey && event.key === "c")) {
      event.preventDefault();
      return onDone(null);
    }
    if (prompt.kind === "text") {
      if (event.key !== "Enter") return;
      event.preventDefault();
      return onDone(text.trim());
    }
    if (prompt.kind === "confirm") {
      const answer = confirmKey(prompt, event.key);
      if (answer === null) return;
      event.preventDefault();
      return onDone(answer);
    }
    const result = listKey(prompt, state, event.key);
    if (result.type === "ignore") return;
    event.preventDefault();
    apply(result);
  }

  if (prompt.kind === "text")
    return (
      <div>
        <label className="t-line t-text">
          <span className="t-accent">?</span> <strong>{prompt.message}</strong>{" "}
          <input
            data-focus
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <div className="t-line t-dim">enter submits · esc {escape}</div>
      </div>
    );

  if (prompt.kind === "confirm")
    return (
      <div className="t-line" tabIndex={0} data-focus onKeyDown={onKeyDown}>
        <span className="t-accent">?</span> <strong>{prompt.message}</strong>{" "}
        <span className="t-dim">(</span>
        <button type="button" className="t-cmd" onClick={() => onDone(true)}>
          {prompt.initial ? "Y" : "y"}
        </button>
        <span className="t-dim">/</span>
        <button type="button" className="t-cmd" onClick={() => onDone(false)}>
          {prompt.initial ? "n" : "N"}
        </button>
        <span className="t-dim">)</span> <span className="t-caret" />
      </div>
    );

  const multi = prompt.kind === "multiselect";
  const width = String(prompt.choices.length).length;
  return (
    <div>
      <div className="t-line">
        <span className="t-accent">?</span> <strong>{prompt.message}</strong>
      </div>
      <ul
        role="listbox"
        aria-label={prompt.message}
        aria-multiselectable={multi || undefined}
        aria-activedescendant={`${prompt.id}-${state.cursor}`}
        tabIndex={0}
        data-focus
        className="t-list"
        onKeyDown={onKeyDown}
      >
        {prompt.choices.map((choice, index) => {
          const current = index === state.cursor;
          const picked = state.picked.includes(index);
          return (
            <li
              key={choice.value}
              id={`${prompt.id}-${index}`}
              role="option"
              aria-selected={multi ? picked : current}
              className={current ? "t-current" : undefined}
              onMouseEnter={() => setState({ ...state, cursor: index })}
              onClick={() => apply(choose(prompt, state, index))}
            >
              <span className="t-accent">{current ? "❯" : " "}</span>{" "}
              {multi && (
                <span className={picked ? "t-ok" : "t-dim"}>
                  {picked ? "◉" : "◯"}{" "}
                </span>
              )}
              <span className="t-dim">
                {String(index + 1).padStart(width)}.
              </span>{" "}
              {choice.label}
              {choice.hint && <span className="t-dim"> — {choice.hint}</span>}
            </li>
          );
        })}
      </ul>
      {state.error && <div className="t-line t-err">{state.error}</div>}
      <div className="t-line t-dim">
        {multi ? (
          <>
            ↑↓ move · space toggles · a all · enter{" "}
            <button
              type="button"
              className="t-cmd"
              onClick={() => apply(submitMulti(prompt, state))}
            >
              confirm
            </button>
          </>
        ) : (
          "↑↓ move · enter chooses"
        )}{" "}
        · esc {escape}
      </div>
    </div>
  );
}
