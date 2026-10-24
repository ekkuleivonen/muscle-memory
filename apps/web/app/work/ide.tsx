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
import {
  latestSavedCode,
  type RecoveredCode,
} from "../../../../packages/capture/restore";
import {
  executableOf,
  type Difficulty,
  type IssueKind,
  type Revision,
} from "../../../../packages/content/model";
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
import { mergedPullRequests } from "../../lib/pulls";
import {
  due,
  feedbackOf,
  type Feedback,
  type Release,
} from "../../lib/feedback";
import { languageLabel, type IssueComment } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import {
  mediaTypeOf,
  repoOf,
  tree,
  type RepoFile,
  type TreeNode,
} from "../../lib/repo";
import { LanguageDot } from "../(browse)/_components/bits";
import { StatusMenu, useBoard } from "../(browse)/_components/board";
import { Markdown } from "../(browse)/_components/markdown";
import { pullHref } from "../(browse)/_components/pulls";
import { createViewer, type Keymap } from "../workspace/editor";
import { checksTypes, TypeChecker } from "../workspace/type-checker";
import { PANEL, panelMax, SIDE, Splitter, useIdeLayout } from "./splitter";
import { caseLabel, transcript, type Executable } from "./transcript";
import { recoveryMessage, saveBadge, saveState } from "../workspace/save-state";
import {
  RUN_TIMEOUT_MS,
  WorkspaceSession,
  type RunView,
  type SaveStatus,
} from "../workspace/session";

export interface IdeIssue {
  key: string;
  slug: string;
  /** The live revision the IDE opens: sha256:… of its content. */
  revision: string;
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
 * One issue as a small repo in a VS Code-like IDE. The issue decides which files are editable;
 * their edits and runs are recorded on this device under the accepted Terms. Everything else
 * opens read-only.
 */
export function Ide({
  revisionsJson,
  issue,
  root,
}: {
  /**
   * Every published revision of the issue by id, as a JSON string: React's serializer would
   * drop a "__proto__" fixture key. The IDE opens the live one; feedback recorded against
   * earlier ones is read from theirs.
   */
  revisionsJson: string;
  issue: IdeIssue;
  /** The repo's folder: the project's key, as in project:shop. */
  root: string;
}) {
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const revision = revisions[issue.revision];
  const challenge = useMemo(() => executableOf(revision), [revision]);
  const repo = useMemo(
    () => repoOf(revision.workspace, issue, root),
    [revision, issue, root],
  );
  const testsFile = repo.files.find((f) => f.role === "tests")!;
  const editable = useMemo(
    () => repo.files.filter((f) => f.role === "edit"),
    [repo],
  );
  /** Where the IDE opens: the entry file when it is editable, else the first editable one. */
  const home =
    editable.find((f) => f.path === challenge.entry)?.path ?? editable[0].path;

  const [view, setView] = useState<"explorer" | "ticket">("ticket");
  const [tabs, setTabs] = useState<string[]>([
    home,
    ...editable.map((f) => f.path).filter((path) => path !== home),
    testsFile.path,
  ]);
  const [active, setActive] = useState(home);
  const [panel, setPanel] = useState<"tests" | "output" | "pulls">("tests");
  /** This person's pull requests for the issue, newest first, across sessions. */
  const [pulls, setPulls] = useState<PullRequestRecord[]>([]);
  /** Which of them the person has merged (on the pull request's page). */
  const [merged, setMerged] = useState<ReadonlySet<number>>(new Set());
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
  /** Editable files changed in this session. */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  /** The boot screen can be dismissed while only the runtime is still loading. */
  const [booted, setBooted] = useState(false);
  /** Teammate comments, hints and review threads released so far. */
  const [feedback, setFeedback] = useState<Feedback>({ released: [], threads: [] });
  /** Something new arrived in the ticket's thread while another view was showing. */
  const [unread, setUnread] = useState(false);

  const layout = useIdeLayout();
  const mainRef = useRef<HTMLElement>(null);
  const board = useBoard();
  // The session's callbacks outlive renders; they read the latest board through this.
  const done = statusOf(board.items, issue.key) === "done";
  /** The pull request new work is pushed to: the latest one, unless it was merged. */
  const openPull =
    pulls[0] &&
    !done &&
    pulls[0].result !== "merged" &&
    !merged.has(pulls[0].number)
      ? pulls[0]
      : null;
  const openPullRef = useRef(openPull);
  openPullRef.current = openPull;
  /** The ticket's thread: its own comments, then released comments and hints. */
  const thread = useMemo(
    () => [
      ...issue.comments.map((c) => ({ ...c, at: undefined as string | undefined })),
      ...feedback.released.flatMap((r) => {
        const from = revisions[r.issueRevision];
        if (r.kind === "hint") {
          const hint = from?.hints.find((h) => h.id === r.hint);
          return hint
            ? [{ author: hint.author.name, role: hint.author.role, body: hint.text, at: r.at }]
            : [];
        }
        const comment = from?.team.find((c) => c.id === r.comment);
        return comment
          ? [
              {
                author: comment.author.name,
                role: comment.author.role,
                body: comment.text[r.wording] ?? comment.text[0],
                at: r.at,
              },
            ]
          : [];
      }),
    ],
    [issue.comments, feedback, revisions],
  );
  /** Open blocking review threads by pull request number. */
  const blocking = useMemo(() => {
    const counts = new Map<number, number>();
    for (const t of feedback.threads)
      if (t.severity === "blocking" && !t.resolved)
        counts.set(t.number, (counts.get(t.number) ?? 0) + 1);
    return counts;
  }, [feedback]);

  const hosts = useRef(new Map<string, HTMLDivElement>());
  const viewers = useRef(new Map<string, EditorView>());
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(issue.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const types = useRef<TypeChecker | null>(null);
  const store = useRef<PracticeStore | null>(null);
  // Each mount (twice in development) bumps this; a superseded open installs nothing.
  const generation = useRef(0);
  const participant = useRef("");
  /** Feedback checks run one at a time, in the order asked for. */
  const reviewing = useRef<Promise<void>>(Promise.resolve());
  const viewRef = useRef(view);
  viewRef.current = view;

  /**
   * Releases whatever teammate feedback the revision's triggers say is due, from what is
   * stored (so pending writes are flushed first), and shows it. `push` names a push whose
   * checks just finished: only then are review comments checked.
   */
  function review(push?: { number: number; push: number }) {
    reviewing.current = reviewing.current.then(async () => {
      const current = session.current;
      const opened = store.current;
      if (!current || !opened) return;
      try {
        await current.recorder.flush();
        let records = await opened.workspaceRecords();
        const releases = due({
          revision,
          records,
          issue: issue.slug,
          participantId: participant.current,
          revisionFor: (id) => revisions[id],
          files: current.code(),
          push,
        });
        if (releases.length) {
          current.release(releases);
          await current.recorder.flush();
          records = await opened.workspaceRecords();
          setMessage(announcement(releases));
          if (
            releases.some((r) => r.kind !== "resolved" && !("pullRequest" in r && r.pullRequest)) &&
            viewRef.current !== "ticket"
          )
            setUnread(true);
        }
        if (session.current === current) setFeedback(feedbackOf(records, issue.slug));
      } catch (cause) {
        console.warn("Teammate feedback could not be checked.", cause);
      }
    });
  }

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

  /** Opens the session on the editable files, restoring the latest saved code. */
  async function open(current: () => boolean) {
    try {
      const account = readProfile();
      const keys: Keymap =
        account?.profile.editor === "vim" ? "vim" : "standard";
      setKeymap(keys);
      store.current ??= await openPracticeStore();
      const participantId = await store.current.participantId();
      participant.current = participantId;
      const records = await store.current.workspaceRecords();
      const recovered: RecoveredCode | null = latestSavedCode(
        records,
        participantId,
        issue.slug,
      );
      const history = pullRequestHistory(records, participantId, issue.slug);
      const mergedNumbers = mergedPullRequests(records, issue.slug);
      const homeHost = hosts.current.get(home);
      // A superseded open must not create a session or record anything.
      if (!homeHost || !current()) return;
      if (recovered) setMessage(recoveryMessage(recovered));
      setPulls(history);
      setMerged(mergedNumbers);
      setFeedback(feedbackOf(records, issue.slug));
      session.current = new WorkspaceSession({
        participantId,
        consentVersion: `terms-${account?.accepted?.version ?? "unknown"}`,
        issue: issue.slug,
        issueRevision: issue.revision,
        executable: challenge,
        sink: store.current,
        files: Object.fromEntries(
          editable.map((f) => [
            f.path,
            {
              text: recovered?.files[f.path] ?? f.text,
              language: f.language,
              mediaType: mediaTypeOf(f.language as LanguageId),
            },
          ]),
        ),
        sources: Object.fromEntries(
          repo.files.filter((f) => f.role === "read").map((f) => [f.path, f.text]),
        ),
        restoredFrom: recovered?.revision,
        language: issue.language,
        keymap: keys,
        types: types.current ?? undefined,
        runtime: issue.runnable && engine ? engine.runtime : null,
        pullRequestsBefore: history[0]?.number ?? 0,
        openPullRequest: () => {
          const open = openPullRef.current;
          return open ? { number: open.number, pushes: open.pushes } : null;
        },
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onRun: (next) => {
          setRun(next);
          setStale(next.revision !== session.current?.currentRevision);
          const pr = next.pullRequest;
          // Once a run or a push's checks finish, teammates may have something to say.
          if (next.status !== "queued" && next.status !== "running")
            review(pr ? { number: pr.number, push: pr.push } : undefined);
          if (!pr) return;
          // Opening shows the pull request at once; its checks fill in when they finish.
          setPulls((current) => [
            {
              number: pr.number,
              pushes: pr.push,
              runId: pr.runId,
              revision: pr.revision,
              result: pr.result ?? "running",
              passed: pr.passed ?? 0,
              total: pr.total ?? challenge.cases.length,
              at: pr.at,
            },
            ...current.filter((p) => p.number !== pr.number),
          ]);
          // It stays open: the person reviews and merges it on its page.
          if (next.status === "queued") setPanel("pulls");
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
        onVimMode: setVimMode,
      });
      // The home file mounts last, so it has the focus.
      for (const file of editable)
        if (file.path !== home)
          session.current.mount(file.path, hosts.current.get(file.path)!);
      session.current.mount(home, homeHost);
      setOpening({ state: "open" });
      review();
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
    if (checksTypes(issue.language))
      types.current = new TypeChecker(challenge.entry);
    void open(() => attempt === generation.current);
    const timer = setInterval(() => {
      // Counts refresh each second; state changes arrive at once through onSaveStatus.
      setCapture(session.current?.saveStatus() ?? null);
      const changed = session.current?.editedFiles() ?? [];
      setEdited((before) =>
        before.size === changed.length && changed.every((p) => before.has(p))
          ? before
          : new Set(changed),
      );
    }, 1000);
    // Hints wait for active minutes, which pass without any other event.
    const feedbackTimer = setInterval(() => review(), 30_000);
    return () => {
      generation.current++;
      clearInterval(timer);
      clearInterval(feedbackTimer);
      runner.current?.dispose();
      runner.current = null;
      types.current?.dispose();
      types.current = null;
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
    if (!file || file.role === "edit" || viewers.current.has(file.path))
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
    if (editable.some((f) => f.path === path)) return;
    setTabs((current) => {
      const next = current.filter((p) => p !== path);
      if (active === path) setActive(next[next.length - 1] ?? home);
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
            issue={{ key: issue.key, slug: issue.slug, revision: issue.revision }}
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
                  title={
                    openPull
                      ? `Push this code to pull request #${openPull.number}: CI checks it again (Ctrl/⌘-Shift-Enter)`
                      : "Open a pull request: CI checks this exact code; then you review it and merge it (Ctrl/⌘-Shift-Enter)"
                  }
                >
                  ⇡{" "}
                  {openPull
                    ? `Push to #${openPull.number}`
                    : done
                      ? "Open another PR"
                      : "Open pull request"}{" "}
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
          label={unread ? "Ticket (new comments)" : "Ticket"}
          active={view === "ticket"}
          dot={unread}
          onClick={() => {
            setView("ticket");
            setUnread(false);
          }}
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
            cases={challenge.cases.length}
            testsPath={testsFile.path}
            thread={thread}
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
                {file.role === "edit" ? (
                  edited.has(path) && <span className="ide-dot" title="Modified" />
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
          {!editable.some((f) => f.path === active) && (
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
                merged={merged}
                blocking={blocking}
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
              <Output
                run={run}
                challenge={challenge}
                runtime={engine?.label ?? languageLabel(issue.language)}
              />
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
  dot,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  /** Something new to look at. */
  dot?: boolean;
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
      {dot && <span className="ide-activity-dot" aria-hidden />}
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
  edited: ReadonlySet<string>;
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
            {edited.has(node.path) && (
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
  thread,
  onOpenTests,
}: {
  issue: IdeIssue;
  cases: number;
  testsPath: string;
  /** The ticket's comments, then teammates' later ones, with when they were posted. */
  thread: (IssueComment & { at?: string })[];
  onOpenTests(): void;
}) {
  const now = new Date();
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
      {thread.length > 0 && (
        <div className="ide-comments">
          {thread.map((comment, i) => (
            <div className="ide-comment" key={i}>
              <b>{comment.author}</b>
              {comment.role && <span className="faint"> · {comment.role}</span>}
              {comment.at && (
                <time className="faint" dateTime={comment.at}>
                  {" "}
                  · {timeAgo(comment.at, now)}
                </time>
              )}
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
        {challenge.cases.length} cases are in {testsPath}.
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
        {challenge.cases.length} cases.
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
  const feedback = runFeedback(challenge.cases, o.cases);
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
        {challenge.cases.map(({ input, expected }, index) => (
          <Case
            key={index}
            index={index}
            label={caseLabel(challenge, input)}
            expected={expected}
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

/** An open pull request by what its checks said; merged ones are labelled Merged. */
const PR_RESULTS: Record<
  string,
  { mark: string; label: string; tone: string }
> = {
  running: { mark: "●", label: "Checks running…", tone: "busy" },
  "checks-passed": { mark: "✔", label: "Open · checks passed", tone: "pass" },
  "checks-failed": { mark: "✘", label: "Open · checks failed", tone: "fail" },
  "checks-errored": { mark: "!", label: "Open · checks errored", tone: "fail" },
  cancelled: { mark: "–", label: "Open · checks cancelled", tone: "faint" },
};
const MERGED = { mark: "⇢", label: "Merged", tone: "merged" };

function PullRequests({
  pulls,
  merged,
  blocking,
  issue,
  done,
  runnable,
}: {
  pulls: PullRequestRecord[];
  merged: ReadonlySet<number>;
  /** Open blocking review threads by pull request number. */
  blocking: ReadonlyMap<number, number>;
  issue: IdeIssue;
  done: boolean;
  runnable: boolean;
}) {
  const now = new Date();
  const isMerged = (pr: PullRequestRecord) =>
    pr.result === "merged" || merged.has(pr.number);
  const mergedPull = pulls.find(isMerged);
  const latest = pulls[0];
  return (
    <div>
      {latest &&
        !done &&
        !isMerged(latest) &&
        latest.result !== "running" &&
        (latest.result === "checks-passed" && blocking.get(latest.number) ? (
          <p className="ide-review">
            Pull request #{latest.number}&apos;s checks pass, but{" "}
            {comments(blocking.get(latest.number)!)} in its review{" "}
            {blocking.get(latest.number) === 1 ? "blocks" : "block"} merging.
            Change the code and push (<kbd>⌘⇧⏎</kbd>), or{" "}
            <Link href={pullHref(issue.key, latest.number)}>reply on #{latest.number}</Link>.
          </p>
        ) : latest.result === "checks-passed" ? (
          <p className="ide-review">
            Pull request #{latest.number} is open and its checks pass.{" "}
            <Link href={pullHref(issue.key, latest.number)}>
              Review it and merge it
            </Link>{" "}
            when you&apos;re happy with it; merging moves {issue.key} to Done.
          </p>
        ) : (
          <p className="ide-review">
            Pull request #{latest.number} is open, but its checks don&apos;t
            pass yet, so it can&apos;t be merged. Keep working and push to it (
            <kbd>⌘⇧⏎</kbd>); CI runs again on the new code.{" "}
            <Link href={pullHref(issue.key, latest.number)}>View #{latest.number}</Link>
          </p>
        ))}
      {done && mergedPull && (
        <p className="ide-done">
          Pull request #{mergedPull.number} merged. {issue.key} is <b>Done</b>.{" "}
          <Link href="/dashboard">Back to your dashboard</Link> or{" "}
          <Link href="/issues">pick the next one</Link>.
        </p>
      )}
      {pulls.length === 0 ? (
        <p className="faint">
          {runnable ? (
            <>
              When your code is ready, open a pull request (<kbd>⌘⇧⏎</kbd>). CI
              runs every check on that exact code; then you review it and merge
              it, which moves {issue.key} to Done. Run the tests (<kbd>⌘⏎</kbd>)
              as often as you like before that.
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
            const shown = isMerged(pr)
              ? MERGED
              : (PR_RESULTS[pr.result] ?? PR_RESULTS["checks-errored"]);
            return (
              <li key={pr.number} className={shown.tone}>
                <span className="ide-pr-mark">{shown.mark}</span>
                {pr.result === "running" ? (
                  <span className="mono">#{pr.number}</span>
                ) : (
                  <Link className="mono" href={pullHref(issue.key, pr.number)}>
                    #{pr.number}
                  </Link>
                )}
                <span className="ide-pr-label">{shown.label}</span>
                <span className="faint">
                  {pr.result === "running"
                    ? `${pr.total} checks`
                    : `${pr.passed}/${pr.total} checks`}
                  {pr.pushes > 1 && ` · ${pr.pushes} pushes`}
                  {!isMerged(pr) && blocking.get(pr.number) && (
                    <span className="ide-pr-blocking">
                      {" · "}
                      {comments(blocking.get(pr.number)!)}
                    </span>
                  )}
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

function comments(count: number): string {
  return `${count} blocking comment${count === 1 ? "" : "s"}`;
}

/** One line in the panel saying what teammates just did. */
function announcement(releases: readonly Release[]): string {
  return releases
    .map((r) => {
      if (r.kind === "hint") return `${r.hint.author.name} commented on the ticket.`;
      if (r.kind === "resolved") return `Review comment on #${r.pullRequest} resolved by your push.`;
      const who = r.comment.author.name;
      if (!r.pullRequest) return `${who} commented on the ticket.`;
      return r.comment.severity === "blocking"
        ? `${who} requested changes on #${r.pullRequest}.`
        : `${who} commented on #${r.pullRequest}.`;
    })
    .join(" ");
}

/** The run as a terminal shows it: printed output, errors with traces, cases, summary. */
function Output({
  run,
  challenge,
  runtime,
}: {
  run: RunView | null;
  challenge: Executable;
  runtime: string;
}) {
  const log = transcript(run, challenge, runtime);
  if (!log.length)
    return (
      <p className="faint">
        Everything your last run printed, raised or returned shows here.
      </p>
    );
  return (
    <pre className="ide-output">
      {log.map((line, index) => (
        <span key={index} className={`ide-line ${line.tone}`}>
          {line.text}
          {"\n"}
        </span>
      ))}
    </pre>
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
 * loading the language's runtime into the tab, with download progress. Editing can start before the
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
                ? `Loading ${engine.label} in this tab`
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
