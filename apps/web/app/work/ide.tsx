"use client";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { EditorView } from "@codemirror/view";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../packages/browser/practice-store";
import { findEntry } from "../../../../packages/catalog/gates";
import {
  latestSavedCode,
  type RecoveredCode,
} from "../../../../packages/capture/restore";
import type {
  Challenge,
  Difficulty,
  IssueComment,
  IssueKind,
} from "../../../../packages/domain/assessment";
import { contentArtifactId } from "../../../../packages/domain/evidence";
import { runFeedback } from "../../../../packages/domain/workspace";
import {
  engineFor,
  Runner,
  type CaseResult,
  type LoadProgress,
} from "../../../../packages/runner/runner";
import { readProfile } from "../../lib/account";
import {
  pullRequestHistory,
  timeAgo,
  type PullRequestRecord,
} from "../../lib/activity";
import { statusOf } from "../../lib/board";
import { languageLabel } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import {
  mediaTypeOf,
  repoFor,
  tree,
  type RepoFile,
  type TreeNode,
} from "../../lib/repo";
import { currentCatalog } from "../current-catalog";
import { LanguageDot } from "../(browse)/_components/bits";
import { StatusMenu, useBoard } from "../(browse)/_components/board";
import { Markdown } from "../(browse)/_components/markdown";
import { createViewer, type Keymap } from "../workspace/editor";
import { PANEL, panelMax, SIDE, Splitter, useIdeLayout } from "./splitter";
import { recoveryMessage, saveBadge, saveState } from "../workspace/save-state";
import {
  RUN_TIMEOUT_MS,
  WorkspaceSession,
  type RunView,
  type SaveStatus,
} from "../workspace/session";

type Executable = Challenge & {
  entrypoint: string;
  starter: string;
  /** Named when each case lists several arguments. */
  parameters?: string[];
  /** SQL: the tables each case's rows go into. */
  schema?: string;
  language?: string;
};

/** How a case reads in the panel: the call, or for SQL the rows it starts with. */
function caseLabel(challenge: Executable, input: unknown): string {
  if (challenge.schema && input && typeof input === "object")
    return Object.entries(input as Record<string, unknown[]>)
      .map(
        ([table, rows]) =>
          `${table}: ${rows.length} row${rows.length === 1 ? "" : "s"}`,
      )
      .join(", ");
  if (challenge.language === "html" && Array.isArray(input))
    return `${input[0]} → ${input[1]}`;
  const args = challenge.parameters ? (input as unknown[]) : [input];
  return `${challenge.entrypoint}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

export interface IdeIssue {
  key: string;
  slug: string;
  version: string;
  title: string;
  task: string;
  kind?: IssueKind;
  difficulty?: Difficulty;
  estimate?: number;
  labels: string[];
  comments: IssueComment[];
  language: LanguageId;
  runnable: boolean;
}

type Runtime =
  | { state: "none" }
  | { state: "loading"; progress?: LoadProgress }
  | { state: "ready" }
  | { state: "unavailable"; message: string };

type Opening =
  | { state: "opening" }
  | { state: "open" }
  | { state: "failed"; message: string };

/**
 * One issue as a small repo in a VS Code-like IDE. The solution file is the only editable
 * one; its edits and runs are recorded on this device under the accepted Terms, exactly as
 * the workspace always has.
 */
export function Ide({
  challengeJson,
  issue,
  project,
}: {
  challengeJson: string;
  issue: IdeIssue;
  project?: { slug: string; title: string; story: string };
}) {
  // JSON.parse keeps a "__proto__" fixture key as ordinary data.
  const challenge = useMemo(
    () => JSON.parse(challengeJson) as Executable,
    [challengeJson],
  );
  const repo = useMemo(
    () =>
      repoFor({
        key: issue.key,
        slug: issue.slug,
        language: issue.language,
        entrypoint: challenge.entrypoint,
        starter: challenge.starter,
        task: challenge.task,
        parameters: challenge.parameters,
        schema: challenge.schema,
        criteria: challenge.inputs.map((input, i) => ({
          input,
          expected: challenge.expected[i],
        })),
        project,
      }),
    [challenge, issue, project],
  );
  const testsFile = repo.files.find((f) => f.role === "tests")!;

  const [view, setView] = useState<"explorer" | "ticket">("ticket");
  const [tabs, setTabs] = useState<string[]>([
    repo.solution.path,
    testsFile.path,
  ]);
  const [active, setActive] = useState(repo.solution.path);
  const [panel, setPanel] = useState<"tests" | "output" | "pulls">("tests");
  /** This person's pull requests for the issue, newest first, across sessions. */
  const [pulls, setPulls] = useState<PullRequestRecord[]>([]);
  const [opening, setOpening] = useState<Opening>({ state: "opening" });
  const [message, setMessage] = useState("");
  const [runtime, setRuntime] = useState<Runtime>(
    issue.runnable ? { state: "loading" } : { state: "none" },
  );
  const [run, setRun] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  const [capture, setCapture] = useState<SaveStatus | null>(null);
  const [keymap, setKeymap] = useState<Keymap>("standard");
  const [vimMode, setVimMode] = useState("normal");
  const [edited, setEdited] = useState(false);
  /** The boot screen can be dismissed while only the runtime is still loading. */
  const [booted, setBooted] = useState(false);

  const layout = useIdeLayout();
  const mainRef = useRef<HTMLElement>(null);
  const board = useBoard();
  // The session's callbacks outlive renders; they read the latest board through this.
  const boardRef = useRef(board);
  boardRef.current = board;
  const done = statusOf(board.items, issue.key) === "done";

  const hosts = useRef(new Map<string, HTMLDivElement>());
  const viewers = useRef(new Map<string, EditorView>());
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(issue.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const store = useRef<PracticeStore | null>(null);
  // Each mount (twice in development) bumps this; a superseded open installs nothing.
  const generation = useRef(0);

  function startRuntime() {
    if (!issue.runnable || !engine) return;
    runner.current?.dispose();
    const next = new Runner(engine, sandboxHost.current!, {
      timeoutMs: RUN_TIMEOUT_MS,
      onProgress: (progress) =>
        runner.current === next &&
        setRuntime((current) =>
          current.state === "loading"
            ? { state: "loading", progress }
            : current,
        ),
    });
    runner.current = next;
    setRuntime({ state: "loading" });
    next.ready().then(
      () => runner.current === next && setRuntime({ state: "ready" }),
      (cause: Error) =>
        // Fail closed: Run stays unavailable rather than executing outside the sandbox.
        runner.current === next &&
        setRuntime({ state: "unavailable", message: cause.message }),
    );
  }

  /** Opens the session on the solution file, restoring the latest saved code. */
  async function open(current: () => boolean) {
    try {
      const catalog = await currentCatalog();
      const ref = {
        kind: "challenge",
        id: challenge.id,
        version: challenge.version,
      } as const;
      if (findEntry(catalog, ref)?.state !== "published")
        throw new Error("This issue is not available right now.");
      const account = readProfile();
      const keys: Keymap =
        account?.profile.editor === "vim" ? "vim" : "standard";
      setKeymap(keys);
      store.current ??= await openPracticeStore();
      const participantId = await store.current.participantId();
      const records = await store.current.workspaceRecords();
      const recovered: RecoveredCode | null = latestSavedCode(
        records,
        participantId,
        contentArtifactId("challenge", challenge.id, challenge.version),
      );
      const history = pullRequestHistory(records, participantId, challenge.id);
      const host = hosts.current.get(repo.solution.path);
      // A superseded open must not create a session or record anything.
      if (!host || !current()) return;
      if (recovered) setMessage(recoveryMessage(recovered));
      setPulls(history);
      session.current = new WorkspaceSession({
        participantId,
        consentVersion: `terms-${account?.accepted?.version ?? "unknown"}`,
        challenge,
        sink: store.current,
        initialCode: recovered?.text ?? challenge.starter,
        restoredFrom: recovered?.revision,
        language: issue.language,
        keymap: keys,
        mediaType: mediaTypeOf(issue.language),
        filename: repo.solution.path,
        runtime: issue.runnable && engine ? engine.runtime : null,
        pullRequestsBefore: history[0]?.number ?? 0,
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onRun: (next) => {
          setRun(next);
          setStale(next.revision !== session.current?.currentRevision);
          const pr = next.pullRequest;
          if (!pr) return;
          // Opening shows the pull request at once; its checks fill in when they finish.
          setPulls((current) => [
            {
              number: pr.number,
              runId: pr.runId,
              revision: pr.revision,
              result: pr.result ?? "running",
              passed: pr.passed ?? 0,
              total: pr.total ?? challenge.inputs.length,
              at: pr.at,
            },
            ...current.filter((p) => p.number !== pr.number),
          ]);
          if (next.status === "queued") setPanel("pulls");
          // A merged pull request is what moves the issue to Done.
          if (pr.result === "merged")
            boardRef.current.complete(
              { key: issue.key, slug: issue.slug, version: issue.version },
              { number: pr.number, runId: pr.runId },
            );
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
        onVimMode: setVimMode,
      });
      session.current.mount(host);
      setOpening({ state: "open" });
    } catch (cause) {
      if (current())
        setOpening({
          state: "failed",
          message:
            cause instanceof Error ? cause.message : "The IDE could not open.",
        });
    }
  }

  useEffect(() => {
    const attempt = ++generation.current;
    startRuntime();
    void open(() => attempt === generation.current);
    const timer = setInterval(() => {
      // Counts refresh each second; state changes arrive at once through onSaveStatus.
      setCapture(session.current?.saveStatus() ?? null);
      setEdited((session.current?.currentRevision ?? 0) > 0);
    }, 1000);
    return () => {
      generation.current++;
      clearInterval(timer);
      runner.current?.dispose();
      runner.current = null;
      // The session flushes its last writes on close; the store stays open for them.
      const closing = session.current;
      session.current = null;
      void closing?.close();
      for (const viewer of viewers.current.values()) viewer.destroy();
      viewers.current.clear();
    };
  }, []);

  // Read-only files get a viewer the first time they are shown.
  useEffect(() => {
    const file = repo.files.find((f) => f.path === active);
    if (!file || file.role === "solution" || viewers.current.has(file.path))
      return;
    const host = hosts.current.get(file.path);
    if (host)
      viewers.current.set(
        file.path,
        createViewer(host, file.text, {
          language: file.language,
          label: `${file.path} (read-only)`,
        }),
      );
  }, [active, tabs, repo]);

  function openFile(path: string) {
    setTabs((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setActive(path);
  }

  function closeTab(path: string) {
    if (path === repo.solution.path) return;
    setTabs((current) => {
      const next = current.filter((p) => p !== path);
      if (active === path)
        setActive(next[next.length - 1] ?? repo.solution.path);
      return next;
    });
  }

  const running = run?.status === "queued" || run?.status === "running";
  const ready = runtime.state === "ready" && opening.state === "open";
  const booting =
    !booted &&
    (opening.state === "opening" ||
      (opening.state === "open" && runtime.state === "loading"));

  return (
    <div
      className="ide"
      style={
        {
          "--side-w": `${layout.side}px`,
          "--panel-h": `${layout.panel}px`,
        } as CSSProperties
      }
    >
      <header className="ide-title">
        <Link
          href={`/issues/${issue.key}`}
          className="ide-back"
          title="Back to the issue"
        >
          ← <span className="mono">{issue.key}</span>
        </Link>
        <span className="ide-name">
          {issue.title}
          <span className="faint"> — {repo.root}</span>
        </span>
        <span className="ide-actions">
          <StatusMenu
            issue={{ key: issue.key, slug: issue.slug, version: issue.version }}
          />
          {issue.runnable ? (
            running ? (
              <button
                type="button"
                className="ide-run cancel"
                onClick={() => session.current?.cancel()}
              >
                ■ Cancel {run?.purpose === "pull-request" ? "checks" : "run"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="ide-run secondary"
                  disabled={!ready}
                  onClick={() => void session.current?.run()}
                  title="Run the tests on your code (Ctrl/⌘-Enter). Nothing else happens."
                >
                  ▶ Run tests <kbd>⌘⏎</kbd>
                </button>
                <button
                  type="button"
                  className="ide-run"
                  disabled={!ready}
                  onClick={() => void session.current?.pullRequest()}
                  title="Open a pull request: CI checks this exact code, and merges it when every check passes (Ctrl/⌘-Shift-Enter)"
                >
                  ⇡ {done ? "Open another PR" : "Open pull request"}{" "}
                  <kbd>⌘⇧⏎</kbd>
                </button>
              </>
            )
          ) : (
            <span
              className="ide-run disabled"
              title={`CI can't run ${languageLabel(issue.language)} yet`}
            >
              ⇡ Open pull request
            </span>
          )}
        </span>
      </header>

      <nav className="ide-activity" aria-label="Views">
        <ActivityButton
          label="Ticket"
          active={view === "ticket"}
          onClick={() => setView("ticket")}
        >
          <TicketIcon />
        </ActivityButton>
        <ActivityButton
          label="Explorer"
          active={view === "explorer"}
          onClick={() => setView("explorer")}
        >
          <FilesIcon />
        </ActivityButton>
      </nav>

      <aside className="ide-side">
        {view === "explorer" ? (
          <Explorer
            root={repo.root}
            files={repo.files}
            active={active}
            edited={edited}
            onOpen={openFile}
          />
        ) : (
          <Ticket
            issue={issue}
            cases={challenge.inputs.length}
            testsPath={testsFile.path}
            onOpenTests={() => openFile(testsFile.path)}
          />
        )}
      </aside>

      <Splitter
        axis="x"
        className="ide-side-splitter"
        label="Resize the side bar"
        value={layout.side}
        min={SIDE.min}
        max={() => SIDE.max}
        initial={SIDE.initial}
        onChange={layout.setSide}
      />

      <main className="ide-main" ref={mainRef}>
        {runtime.state === "loading" && !booting && (
          <div
            className="ide-progress"
            role="progressbar"
            aria-label={`Loading ${engine?.label ?? "the runtime"}`}
            {...progressValue(runtime.progress)}
          />
        )}
        <div className="ide-tabs" role="tablist" aria-label="Open files">
          {tabs.map((path) => {
            const file = repo.files.find((f) => f.path === path)!;
            return (
              <div
                key={path}
                role="tab"
                aria-selected={path === active}
                className="ide-tab"
                onClick={() => setActive(path)}
              >
                <LanguageDot language={file.language} />
                {path.split("/").pop()}
                {file.role === "solution" ? (
                  edited && <span className="ide-dot" title="Modified" />
                ) : (
                  <button
                    type="button"
                    className="ide-close"
                    aria-label={`Close ${path}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(path);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="ide-crumbs faint">
          {repo.root} › {active.split("/").join(" › ")}
          {active !== repo.solution.path && (
            <span className="ide-ro">read-only</span>
          )}
        </div>
        <div className="ide-editors">
          {repo.files.map((file) => (
            <div
              key={file.path}
              className="ide-editor"
              hidden={!tabs.includes(file.path) || file.path !== active}
              ref={(node) => {
                if (node) hosts.current.set(file.path, node);
              }}
            />
          ))}
          {opening.state === "failed" && (
            <p className="ide-overlay error" role="alert">
              {opening.message}
            </p>
          )}
        </div>

        <section className="ide-panel">
          <Splitter
            axis="y"
            className="ide-panel-splitter"
            label="Resize the panel"
            value={layout.panel}
            min={PANEL.min}
            max={() => panelMax(mainRef.current?.clientHeight ?? 600)}
            initial={PANEL.initial}
            onChange={layout.setPanel}
          />
          <div className="ide-panel-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={panel === "tests"}
              onClick={() => setPanel("tests")}
            >
              Tests
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "output"}
              onClick={() => setPanel("output")}
            >
              Output
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "pulls"}
              onClick={() => setPanel("pulls")}
            >
              Pull requests{" "}
              {pulls.length > 0 && (
                <span className="ide-count">{pulls.length}</span>
              )}
            </button>
            {message && <span className="ide-message faint">{message}</span>}
          </div>
          <div className="ide-panel-body">
            {panel === "pulls" ? (
              <PullRequests
                pulls={pulls}
                issue={issue}
                done={done}
                runnable={issue.runnable}
              />
            ) : panel === "tests" ? (
              <Tests
                challenge={challenge}
                run={run}
                stale={stale}
                issue={issue}
                testsPath={testsFile.path}
                runtime={runtime}
                onRetry={startRuntime}
              />
            ) : (
              <Output run={run} />
            )}
          </div>
        </section>
      </main>

      <footer className="ide-status">
        <span title="Branch">⎇ {repo.branch}</span>
        {capture && (
          <span
            className={`ide-save ${saveBadge(capture).tone}`}
            title={saveState(capture, true)}
          >
            {saveBadge(capture).label}
          </span>
        )}
        <span className="ide-status-right">
          {keymap === "vim" && (
            <span className="ide-vim">-- {vimMode.toUpperCase()} --</span>
          )}
          <span>{languageLabel(issue.language)}</span>
          <span>
            {issue.runnable && engine
              ? `${engine.label} · ${runtimeLabel(runtime)}`
              : "No runner yet"}
          </span>
        </span>
      </footer>
      {booting && (
        <Boot
          issue={issue}
          root={repo.root}
          branch={repo.branch}
          opening={opening}
          runtime={runtime}
          onSkip={() => setBooted(true)}
        />
      )}
      <div ref={sandboxHost} hidden />
    </div>
  );
}

/** Download share as aria values and a CSS variable; indeterminate while starting. */
function progressValue(progress?: LoadProgress) {
  if (progress?.phase !== "download" || !progress.total) return {};
  const percent = Math.round((progress.loaded / progress.total) * 100);
  return {
    "aria-valuenow": percent,
    style: { "--progress": `${percent}%` } as CSSProperties,
  };
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0);
}

function runtimeLabel(runtime: Runtime): string {
  if (runtime.state === "loading") {
    const p = runtime.progress;
    if (p?.phase === "download" && p.loaded < p.total)
      return `downloading ${Math.round((p.loaded / p.total) * 100)}%`;
    return "starting…";
  }
  if (runtime.state === "ready") return "ready";
  if (runtime.state === "unavailable") return "unavailable";
  return "";
}

function ActivityButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ide-activity-button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Explorer({
  root,
  files,
  active,
  edited,
  onOpen,
}: {
  root: string;
  files: RepoFile[];
  active: string;
  edited: boolean;
  onOpen(path: string): void;
}) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const render = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) =>
      node.children ? (
        <li key={node.path}>
          <span className="ide-folder" style={{ paddingLeft: 8 + depth * 12 }}>
            ▾ {node.name}
          </span>
          <ul>{render(node.children, depth + 1)}</ul>
        </li>
      ) : (
        <li key={node.path}>
          <button
            type="button"
            className="ide-file"
            aria-current={node.path === active ? "true" : undefined}
            style={{ paddingLeft: 20 + depth * 12 }}
            onClick={() => onOpen(node.path)}
          >
            <LanguageDot language={byPath.get(node.path)!.language} />
            {node.name}
            {byPath.get(node.path)!.role === "solution" && edited && (
              <span className="ide-git" title="Modified">
                M
              </span>
            )}
          </button>
        </li>
      ),
    );
  return (
    <div className="ide-explorer">
      <h2>Explorer</h2>
      <div className="ide-root">▾ {root.toUpperCase()}</div>
      <ul>{render(tree(files.map((f) => f.path)), 0)}</ul>
    </div>
  );
}

function Ticket({
  issue,
  cases,
  testsPath,
  onOpenTests,
}: {
  issue: IdeIssue;
  cases: number;
  testsPath: string;
  onOpenTests(): void;
}) {
  return (
    <div className="ide-ticket">
      <h2>Ticket</h2>
      <p className="ide-ticket-key mono">{issue.key}</p>
      <h3>{issue.title}</h3>
      <Markdown source={issue.task} />
      <p className="ide-ticket-tests">
        {cases} acceptance check{cases === 1 ? "" : "s"} in{" "}
        <button type="button" className="ide-link" onClick={onOpenTests}>
          {testsPath}
        </button>
      </p>
      {issue.comments.length > 0 && (
        <div className="ide-comments">
          {issue.comments.map((comment, i) => (
            <div className="ide-comment" key={i}>
              <b>{comment.author}</b>
              {comment.role && <span className="faint"> · {comment.role}</span>}
              <Markdown source={comment.body} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tests({
  challenge,
  run,
  stale,
  issue,
  testsPath,
  runtime,
  onRetry,
}: {
  challenge: Executable;
  run: RunView | null;
  stale: boolean;
  issue: IdeIssue;
  testsPath: string;
  runtime: Runtime;
  onRetry(): void;
}) {
  if (!issue.runnable)
    return (
      <p className="faint">
        Running {languageLabel(issue.language)} in the browser isn&apos;t
        available yet. Your edits are saved as you go; the{" "}
        {challenge.inputs.length} cases are in {testsPath}.
      </p>
    );
  if (runtime.state === "unavailable")
    return (
      <p className="error" role="alert">
        {engineFor(issue.language)?.label} could not load: {runtime.message}{" "}
        <button type="button" className="ide-link" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  if (!run)
    return (
      <p className="faint">
        Run the tests (<kbd>⌘⏎</kbd>) to check your code against{" "}
        {challenge.inputs.length} cases.
      </p>
    );
  const o = run.outcome;
  if (!o) return <p className="faint">Running…</p>;
  if (o.status === "timeout")
    return (
      <p className="error">
        Stopped after {o.timeoutMs / 1000} s. Look for a loop that never ends.
      </p>
    );
  if (o.status === "cancelled") return <p className="faint">Run cancelled.</p>;
  if (o.status === "runner-error")
    return (
      <p className="error">
        {engineFor(issue.language)?.label} failed ({o.phase}), not your code:{" "}
        {o.message}
      </p>
    );
  if (o.error && o.phase !== "tests")
    return (
      <pre className="ide-trace">
        {o.error.traceback.text || `${o.error.type}: ${o.error.message}`}
      </pre>
    );
  const feedback = runFeedback(challenge, o.cases);
  const failed = feedback.total - feedback.correct;
  return (
    <div>
      <p className="ide-run-label faint">
        {run.pullRequest
          ? `Checks for pull request #${run.pullRequest.number}`
          : "Local run"}{" "}
        · revision {run.revision}
      </p>
      <p className={`ide-summary ${failed ? "fail" : "pass"}`}>
        {failed ? "✘" : "✔"} {feedback.correct} passed
        {failed > 0 && `, ${failed} failed`} · {o.durationMs} ms
        {stale && (
          <span className="faint">
            {" "}
            · for revision {run.revision}; you have edited since
          </span>
        )}
      </p>
      <ol className="ide-cases">
        {challenge.inputs.map((input, index) => (
          <Case
            key={index}
            index={index}
            label={caseLabel(challenge, input)}
            expected={challenge.expected[index]}
            passed={feedback.passed[index]}
            result={o.cases[index]}
          />
        ))}
      </ol>
    </div>
  );
}

function Case({
  index,
  label,
  expected,
  passed,
  result,
}: {
  index: number;
  label: string;
  expected: unknown;
  passed: boolean;
  result?: CaseResult;
}) {
  return (
    <li className={passed ? "pass" : "fail"}>
      <span className="ide-case-mark">{passed ? "✔" : "✘"}</span>
      <span className="ide-case-body">
        <code>{label}</code>
        {!passed && (
          <span className="ide-case-detail">
            <span>
              expected <code>{JSON.stringify(expected)}</code>
            </span>
            {result?.error ? (
              <pre className="ide-trace">{result.error.traceback.text}</pre>
            ) : result?.conversionError ? (
              <pre className="ide-trace">
                {result.conversionError.traceback.text ||
                  `${result.conversionError.type}: ${result.conversionError.message}`}
              </pre>
            ) : (
              <span>
                got <code>{result?.repr?.text ?? "nothing"}</code>
                {result?.unserializable &&
                  ` (not JSON: ${result.unserializable})`}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="ide-case-index faint">#{index + 1}</span>
    </li>
  );
}

const PR_RESULTS: Record<
  string,
  { mark: string; label: string; tone: string }
> = {
  running: { mark: "●", label: "Checks running…", tone: "busy" },
  merged: { mark: "✔", label: "Merged", tone: "pass" },
  "checks-failed": { mark: "✘", label: "Checks failed", tone: "fail" },
  "checks-errored": { mark: "!", label: "Checks errored", tone: "fail" },
  cancelled: { mark: "–", label: "Closed", tone: "faint" },
};

function PullRequests({
  pulls,
  issue,
  done,
  runnable,
}: {
  pulls: PullRequestRecord[];
  issue: IdeIssue;
  done: boolean;
  runnable: boolean;
}) {
  const now = new Date();
  const merged = pulls.find((p) => p.result === "merged");
  return (
    <div>
      {done && merged && (
        <p className="ide-done">
          Pull request #{merged.number} merged. {issue.key} is <b>Done</b>.{" "}
          <Link href="/">Back to your dashboard</Link> or{" "}
          <Link href="/issues">pick the next one</Link>.
        </p>
      )}
      {pulls.length === 0 ? (
        <p className="faint">
          {runnable ? (
            <>
              When your code is ready, open a pull request (<kbd>⌘⇧⏎</kbd>). CI
              runs every check on that exact code and merges it when they all
              pass, which moves {issue.key} to Done. Run the tests (
              <kbd>⌘⏎</kbd>) as often as you like before that.
            </>
          ) : (
            <>
              CI can&apos;t run {languageLabel(issue.language)} yet, so pull
              requests open once a runner exists. Your edits are saved.
            </>
          )}
        </p>
      ) : (
        <ol className="ide-pulls">
          {pulls.map((pr) => {
            const shown = PR_RESULTS[pr.result] ?? PR_RESULTS["checks-errored"];
            return (
              <li key={pr.number} className={shown.tone}>
                <span className="ide-pr-mark">{shown.mark}</span>
                <span className="mono">#{pr.number}</span>
                <span className="ide-pr-label">{shown.label}</span>
                <span className="faint">
                  {pr.result === "running"
                    ? `${pr.total} checks`
                    : `${pr.passed}/${pr.total} checks`}{" "}
                  · revision {pr.revision}
                </span>
                <time className="faint" dateTime={pr.at}>
                  {timeAgo(pr.at, now)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Output({ run }: { run: RunView | null }) {
  const o = run?.outcome;
  if (!o || !("stdout" in o))
    return (
      <p className="faint">print() output from your last run shows here.</p>
    );
  const text = o.stdout.text + o.stderr.text;
  return (
    <div>
      {text ? (
        <pre className="ide-output">{text}</pre>
      ) : (
        <p className="faint">No output.</p>
      )}
      {(o.stdout.truncated || o.stderr.truncated) && (
        <p className="faint">
          Output truncated: showing the first 64 KiB of{" "}
          {o.stdout.bytes + o.stderr.bytes} bytes.
        </p>
      )}
    </div>
  );
}

function TicketIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/**
 * What the IDE is doing while it opens: checking out the issue's repo, restoring saved work and
 * installing the language's runtime, with download progress. Editing can start before the
 * runtime is ready; only Run waits for it.
 */
function Boot({
  issue,
  root,
  branch,
  opening,
  runtime,
  onSkip,
}: {
  issue: IdeIssue;
  root: string;
  branch: string;
  opening: Opening;
  runtime: Runtime;
  onSkip(): void;
}) {
  const engine = engineFor(issue.language);
  const opened = opening.state === "open";
  const progress = runtime.state === "loading" ? runtime.progress : undefined;
  const downloading =
    progress?.phase === "download" && progress.loaded < progress.total;
  return (
    <div className="ide-boot" role="status" aria-live="polite">
      <div className="ide-boot-card">
        <img src="/logo.svg" alt="" className="ide-boot-logo" />
        <p className="ide-boot-title">
          <span className="mono faint">{issue.key}</span> {issue.title}
        </p>
        <ol className="ide-boot-steps">
          <BootStep state="done">
            Cloned <b>{root}</b>
          </BootStep>
          <BootStep state={opened ? "done" : "busy"}>
            {opened ? "Checked out " : "Checking out "}
            <b className="mono">{branch}</b>
            {!opened && " and restoring your saved work…"}
          </BootStep>
          {engine ? (
            <BootStep state={runtime.state === "loading" ? "busy" : "done"}>
              {downloading
                ? `Installing ${engine.label}`
                : runtime.state === "loading"
                  ? `Starting ${engine.label}…`
                  : `${engine.label} ready`}
              {downloading && progress?.phase === "download" && (
                <>
                  <span className="faint">
                    {" "}
                    · {megabytes(progress.loaded)} of{" "}
                    {megabytes(progress.total)} MB
                  </span>
                  <span
                    className="ide-boot-bar"
                    style={
                      {
                        "--progress": `${Math.round((progress.loaded / progress.total) * 100)}%`,
                      } as CSSProperties
                    }
                  />
                </>
              )}
            </BootStep>
          ) : (
            <BootStep state="skipped">
              No runner for {languageLabel(issue.language)} yet; your edits are
              still saved
            </BootStep>
          )}
        </ol>
        {opened && (
          <button
            type="button"
            className="ide-link ide-boot-skip"
            onClick={onSkip}
          >
            Start editing now; Run waits for the runtime
          </button>
        )}
      </div>
    </div>
  );
}

function BootStep({
  state,
  children,
}: {
  state: "done" | "busy" | "skipped";
  children: ReactNode;
}) {
  return (
    <li className={`ide-boot-step ${state}`}>
      <span className="ide-boot-mark" aria-hidden>
        {state === "done" ? "✔" : state === "busy" ? "" : "–"}
      </span>
      <span>{children}</span>
    </li>
  );
}
