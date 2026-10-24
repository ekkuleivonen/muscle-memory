"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ensureHandle,
  readProfile,
  saveProfile,
  startSession,
} from "../../lib/account";
import {
  ACTIVITY_DISCLOSURE,
  ACTIVITY_KEY,
  consentRecord,
  parseConsent,
} from "../../lib/activity-log";
import { languageLabel } from "../../lib/library";
import type { Profile } from "../../lib/onboarding";
import {
  choose,
  confirmKey,
  formatAnswer,
  initialList,
  listKey,
  submitMulti,
  type Answer,
  type ListResult,
  type ListState,
  type Prompt,
} from "./prompts";
import { describeProfile, QUESTIONS, toProfile } from "./questions";

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

function activityLogOn(): boolean {
  return parseConsent(localStorage.getItem(ACTIVITY_KEY)) !== null;
}

/**
 * New-hire setup as a terminal, run once: profile questions, a laptop "install", the handle
 * and the activity-log question, then on to the app. Everything after lives in the UI
 * (Settings). `next` is where the person was heading, already checked to be same-site;
 * `again` re-asks the questions from Settings and returns there.
 */
export function Terminal({
  next,
  again,
}: {
  next: string | null;
  again: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState<Active>({ type: "busy" });
  const activeRef = useRef(active);
  activeRef.current = active;
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

  /** Shows a prompt and resolves with its answer, or null when skipped. */
  function ask(prompt: Prompt): Promise<Answer | null> {
    return new Promise((resolve) =>
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
                <span className="t-dim">· skipped</span>
              </span>
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

  function printProfile(value: Profile) {
    print(
      ...describeProfile(value).map(([label, text]) => (
        <span>
          <span className="t-dim">{`  ${label.padEnd(12)}`}</span>
          {text}
        </span>
      )),
    );
  }

  /** Prints where it is going, then goes; the link is there if the push is slow. */
  function finish(path: string, label: string) {
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

  async function setup() {
    print(
      "",
      again ? (
        <span>Let&apos;s go through the questions again.</span>
      ) : (
        <span>Welcome aboard. Let&apos;s set up your profile and laptop.</span>
      ),
      <span className="t-dim">
        Arrow keys or numbers to choose · Esc skips a question · answers stay on
        this device.
      </span>,
      "",
    );
    const answers: Record<string, Answer> = {};
    for (const question of QUESTIONS) {
      const answer = await ask(question);
      if (answer !== null) answers[question.id] = answer;
    }
    const profile: Profile = toProfile(answers);
    const { handle } = saveProfile(profile);
    const { languages = [], editor } = profile;
    print(
      "",
      ...languages.map((id) => (
        <span>
          <span className="t-dim">→</span> installing {languageLabel(id)}{" "}
          <span className="t-ok">✔</span>
        </span>
      )),
      ...(editor
        ? [
            <span>
              <span className="t-dim">→</span> setting editor keybindings to{" "}
              {editor === "vim" ? "Vim" : "VS Code-style"}{" "}
              <span className="t-ok">✔</span>
            </span>,
          ]
        : []),
      <span className="t-ok">Laptop ready.</span>,
      <span>
        <span className="t-dim">→</span> your handle is{" "}
        <span className="t-brand">{handle}</span>{" "}
        <span className="t-dim">(anonymous, handed out at random)</span>
      </span>,
    );
    printProfile(profile);
    print(
      <span className="t-dim">
        Saved in this browser only; change it any time in Settings.
      </span>,
      "",
    );
    if (!again && !activityLogOn()) await askActivityLog();
    if (again) finish("/settings", "Settings");
    else finish(next ?? "/", next ? next : "your dashboard");
  }

  /** Opt-in only: the disclosure, then a question whose default is no. */
  async function askActivityLog() {
    print(
      ...ACTIVITY_DISCLOSURE.map((line) => (
        <span className="t-dim">{line}</span>
      )),
    );
    const yes = await ask({
      kind: "confirm",
      id: "activity-log",
      message: "Keep the activity log?",
      initial: false,
    });
    if (yes)
      localStorage.setItem(
        ACTIVITY_KEY,
        consentRecord(new Date().toISOString()),
      );
  }

  /** Back after logging out: sign in again, or answer the questions afresh. */
  async function welcomeBack() {
    const handle = ensureHandle();
    print("", <span>Welcome back.</span>);
    const yes = await ask({
      kind: "confirm",
      id: "login",
      message: `Sign in as ${handle}?`,
      initial: true,
    });
    if (yes) {
      startSession();
      return finish(next ?? "/", next ? next : "your dashboard");
    }
    await setup();
  }

  useEffect(() => {
    // Strict Mode mounts twice in development; boot once.
    if (booted.current) return;
    booted.current = true;
    print(
      <span className="t-brand">muscle memory</span>,
      <span className="t-dim">new hire setup</span>,
    );
    // Signed-in visits are redirected by the server unless re-answering from Settings.
    void (readProfile() && !again ? welcomeBack() : setup());
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
        // Clicking anywhere returns focus to the input, unless the click selected text.
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

function PromptView({
  prompt,
  onDone,
}: {
  prompt: Prompt;
  onDone(answer: Answer | null): void;
}) {
  const [state, setState] = useState<ListState>(initialList);
  function apply(result: ListResult) {
    if (result.type === "state") setState(result.state);
    if (result.type === "submit") onDone(result.value);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" || (event.ctrlKey && event.key === "c")) {
      event.preventDefault();
      return onDone(null);
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
        · esc skips
      </div>
    </div>
  );
}
