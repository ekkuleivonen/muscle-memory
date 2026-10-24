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
  encodePendingExport,
  openPracticeStore,
} from "../../../../packages/browser/practice-store";
import { BOARD_KEY } from "../../lib/board";
import { languageLabel } from "../../lib/library";
import {
  issuesFor,
  ONBOARDING_COOKIE,
  ONBOARDING_VERSION,
  PROFILE_KEY,
  type Profile,
  type StoredProfile,
} from "../../lib/onboarding";
import { COMMANDS, complete, parseCommand } from "./commands";
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
  | { type: "shell" }
  | { type: "busy" }
  | {
      type: "prompt";
      /** Distinguishes consecutive prompts so each starts fresh. */
      token: number;
      prompt: Prompt;
      resolve: (answer: Answer | null) => void;
    };

const PS1 = "~ $";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

function readProfile(): StoredProfile | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(PROFILE_KEY) ?? "null",
    ) as StoredProfile | null;
    return stored?.version === ONBOARDING_VERSION ? stored : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: Profile) {
  const stored: StoredProfile = {
    version: ONBOARDING_VERSION,
    completedAt: new Date().toISOString(),
    profile,
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(stored));
  document.cookie = `${ONBOARDING_COOKIE}=${ONBOARDING_VERSION}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
}

function forgetProfile() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(BOARD_KEY);
  document.cookie = `${ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * New-hire setup as a terminal: profile questions, then a shell for revisiting them. `next`
 * is where the person was heading before being sent here, already checked to be same-site.
 */
export function Terminal({ next }: { next: string | null }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState<Active>({ type: "busy" });
  const activeRef = useRef(active);
  activeRef.current = active;
  const nextId = useRef(0);
  const profile = useRef<Profile | null>(null);
  const history = useRef<string[]>([]);
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

  function Cmd({ line, children }: { line: string; children?: ReactNode }) {
    return (
      <button
        type="button"
        className="t-cmd"
        onClick={() => activeRef.current.type === "shell" && void exec(line)}
      >
        {children ?? line}
      </button>
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

  async function setup() {
    print(
      "",
      <span>Welcome aboard. Let&apos;s set up your profile and laptop.</span>,
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
    profile.current = toProfile(answers);
    saveProfile(profile.current);
    const { languages = [], editor } = profile.current;
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
    );
    printProfile(profile.current);
    print(
      <span className="t-dim">
        Saved in this browser only. A cookie remembers that setup is done; it
        holds no answers.
      </span>,
      "",
    );
    if (
      await ask({
        kind: "confirm",
        id: "go",
        message: next
          ? "Continue where you were going?"
          : "Open your dashboard?",
        initial: true,
      })
    )
      return go(next ?? "/");
    print(
      <span className="t-dim">
        Type <Cmd line="help" /> to look around, or <Cmd line="home" /> when
        you&apos;re ready.
      </span>,
    );
  }

  function go(path: string) {
    print(<span className="t-dim">Opening {path}…</span>);
    router.push(path);
  }

  async function data(sub: string | undefined) {
    if (sub !== "export" && sub !== "clear") {
      print(
        <span>
          usage: <Cmd line="data export" /> | <Cmd line="data clear" />
        </span>,
      );
      return;
    }
    if (sub === "clear") {
      const sure = await ask({
        kind: "confirm",
        id: "clear",
        message:
          "Clear your profile, board, saved practice, workspace activity and local identity on this device?",
        initial: false,
      });
      if (!sure) return print(<span className="t-dim">Nothing cleared.</span>);
    }
    const store = await openPracticeStore();
    try {
      if (sub === "clear") {
        await store.clear();
        forgetProfile();
        profile.current = null;
        print(
          "Cleared. Downloaded copies must be removed separately. Setup starts again on your next visit, or run setup now.",
        );
        return;
      }
      const events = await store.pending();
      if (!events.length)
        return print(
          <span className="t-dim">No saved practice on this device.</span>,
        );
      const url = URL.createObjectURL(
        new Blob([encodePendingExport(events)], {
          type: "application/x-ndjson",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "muscle-memory-local-events.jsonl";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // A browser download is no proof of a write, so events stay and export stays repeatable.
      print(
        `Downloaded ${events.length} saved event(s). They stay on this device.`,
      );
    } finally {
      store.close();
    }
  }

  async function exec(line: string) {
    setActive({ type: "busy" });
    print(
      <span>
        <span className="t-ps1">{PS1}</span> {line}
      </span>,
    );
    if (line.trim()) history.current.push(line);
    const command = parseCommand(line) ?? { name: "", args: [] };
    try {
      switch (command.name) {
        case "":
          break;
        case "help":
          print(
            ...COMMANDS.map((c) => (
              <span>
                {"  "}
                <Cmd line={c.name} />
                {" ".repeat(12 - c.name.length)}
                <span className="t-dim">{c.summary}</span>
              </span>
            )),
            <span className="t-dim">
              {"  "}Tab completes · ↑↓ history · Ctrl-L clears
            </span>,
          );
          break;
        case "clear":
          setLines([]);
          break;
        case "setup":
          await setup();
          break;
        case "profile":
          if (profile.current) printProfile(profile.current);
          else
            print(
              <span>
                No profile yet. Run <Cmd line="setup" />.
              </span>,
            );
          break;
        case "home":
          return go(next ?? "/");
        case "issues":
          return go(issuesFor(profile.current ?? {}));
        case "data":
          await data(command.args[0]);
          break;
        default:
          print(
            <span>
              <span className="t-err">command not found:</span> {command.name}.
              Try <Cmd line="help" />.
            </span>,
          );
      }
    } catch (cause) {
      print(
        <span className="t-err">
          {cause instanceof Error ? cause.message : "Something went wrong."}
        </span>,
      );
    }
    setActive({ type: "shell" });
  }

  useEffect(() => {
    // Strict Mode mounts twice in development; boot once.
    if (booted.current) return;
    booted.current = true;
    print(
      <span className="t-brand">muscle memory</span>,
      <span className="t-dim">new hire setup</span>,
    );
    const stored = readProfile();
    if (stored) {
      profile.current = stored.profile;
      print("", <span>You&apos;re already set up.</span>);
      printProfile(stored.profile);
      print(
        "",
        <span>
          <Cmd line="home" /> for your dashboard, <Cmd line="setup" /> to answer
          again, or <Cmd line="help" />.
        </span>,
      );
      setActive({ type: "shell" });
      return;
    }
    void setup().then(() => {
      if (activeRef.current.type !== "shell") setActive({ type: "shell" });
    });
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
      {active.type === "shell" && (
        <ShellInput
          history={history.current}
          onRun={(line) => void exec(line)}
          onClear={() => setLines([])}
          onOptions={(options) =>
            print(<span className="t-dim">{options.join("  ")}</span>)
          }
        />
      )}
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

function ShellInput({
  history,
  onRun,
  onClear,
  onOptions,
}: {
  history: readonly string[];
  onRun(line: string): void;
  onClear(): void;
  onOptions(options: string[]): void;
}) {
  const [value, setValue] = useState("");
  // history.length means "the new line being typed".
  const [cursor, setCursor] = useState(history.length);
  function recall(index: number) {
    const next = Math.max(0, Math.min(history.length, index));
    setCursor(next);
    setValue(history[next] ?? "");
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Fast commands finish within one render, so this input may stay mounted.
      onRun(value);
      setValue("");
      setCursor(history.length);
    } else if (event.key === "Tab") {
      const result = complete(value);
      setValue(result.line);
      if (result.options.length) onOptions(result.options);
    } else if (event.key === "ArrowUp") recall(cursor - 1);
    else if (event.key === "ArrowDown") recall(cursor + 1);
    else if (event.ctrlKey && event.key === "l") onClear();
    else if (event.ctrlKey && event.key === "c") {
      setValue("");
      setCursor(history.length);
    } else return;
    event.preventDefault();
  }
  return (
    <label className="t-line t-shell">
      <span className="t-ps1">{PS1}</span>{" "}
      <input
        data-focus
        aria-label="Command"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </label>
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
