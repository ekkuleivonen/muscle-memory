"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../packages/browser/practice-store";
import {
  latestSavedCode,
  type RecoveredCode,
} from "../../../../packages/capture/restore";
import {
  casesRun,
  executableOf,
  type Difficulty,
  type IssueKind,
  type Revision,
} from "../../../../packages/content/model";
import { runFeedback } from "../../../../packages/domain/workspace";
import type { Json } from "../../../../packages/domain/json";
import {
  engineFor,
  Runner,
  type CaseResult,
  type LoadProgress,
} from "../../../../packages/runner/runner";
import { readProfile } from "../../lib/account";
import { pullRequestHistory, type PullRequestRecord } from "../../lib/activity";
import { attemptAt, attemptRecords } from "../../lib/attempts";
import { statusOf } from "../../lib/board";
import { closedPullRequests, mergedPullRequests } from "../../lib/pulls";
import { languageLabel, type IssueComment } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import { mediaTypeOf, repoOf } from "../../lib/repo";
import { StartWork, useBoard } from "../(browse)/_components/board";
import {
  PREVIOUS_PATH_KEY,
  setIssueContext,
} from "../(browse)/_components/board-log";
import { Markdown } from "../(browse)/_components/markdown";
import { type Keymap } from "../workspace/editor";
import { checksTypes, TypeChecker } from "../workspace/type-checker";
import { caseLabel, transcript, type Executable } from "./transcript";
import { recoveryMessage, saveBadge } from "../workspace/save-state";
import {
  RUN_TIMEOUT_MS,
  WorkspaceSession,
  type RunView,
  type SaveStatus,
} from "../workspace/session";

import {
  fitView,
  readView,
  writeView,
  viewScope,
  type FileView,
} from "../workspace/continuity";

import { ChallengeExamples } from "../(browse)/_components/challenge-examples";
import { privateCheckFailure } from "./check-feedback";
import {
  completionEligibility,
  type CompletionGate,
} from "../../lib/completion";
import { completePractice } from "../../lib/complete-practice";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { CheckFeedbackView } from "../(browse)/_components/review";
import { CopyIssueLink } from "../(browse)/_components/share";
import { nextProblem } from "../../lib/next-problem";
import type { IssueSummary } from "../../lib/library";

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
  candidates,
  issue,
  root,
}: {
  /**
   * Every published revision of the issue by id, as a JSON string: React's serializer would
   * drop a "__proto__" fixture key. The IDE opens the live one; feedback recorded against
   * earlier ones is read from theirs.
   */
  revisionsJson: string;
  candidates: IssueSummary[];
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
  const editable = useMemo(
    () => repo.files.filter((f) => f.role === "edit"),
    [repo],
  );
  /** Where the IDE opens: the entry file when it is editable, else the first editable one. */
  const home =
    editable.find((f) => f.path === challenge.entry)?.path ?? editable[0].path;

  const view = "ticket" as const; // Existing navigation value: the challenge is visible.
  const [tabs, setTabs] = useState<string[]>([
    home,
    ...editable.map((f) => f.path).filter((path) => path !== home),
  ]);
  const [active, setActiveState] = useState(home);
  const setActive = (path: string) => {
    // Capture the old file while it still has a layout box.
    session.current?.places();
    setActiveState(path);
  };
  const [panel, setPanel] = useState<"tests" | "output" | "pulls">("tests");
  const savedScope = useRef<string | null>(null);
  const pendingPlaces = useRef<Record<string, FileView>>({});
  const viewNow = useRef({ tabs, active, side: view, panel });
  viewNow.current = { tabs, active, side: view, panel };
  const persistView = () => {
    if (savedScope.current && session.current)
      writeView({
        scope: savedScope.current,
        ...viewNow.current,
        files: { ...session.current.places(), ...pendingPlaces.current },
        savedAt: new Date().toISOString(),
      });
  };
  /** This person's pull requests for the issue, newest first, across sessions. */
  const [pulls, setPulls] = useState<PullRequestRecord[]>([]);
  /** Which of them the person has merged (on the pull request's page). */
  const [merged, setMerged] = useState<ReadonlySet<number>>(new Set());
  /** Which of them the person closed without merging. */
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set());
  const [opening, setOpening] = useState<Opening>({ state: "opening" });
  const [message, setMessage] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [runtime, setRuntime] = useState<Runtime>(
    issue.runnable ? { state: "loading" } : { state: "none" },
  );
  const runtimeNow = useRef(runtime);
  runtimeNow.current = runtime;
  const [run, setRun] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  const [capture, setCapture] = useState<SaveStatus | null>(null);
  const [keymap, setKeymap] = useState<Keymap>("standard");
  const [vimMode, setVimMode] = useState("normal");
  const [verification, setVerification] = useState<CompletionGate | null>(null);
  const [lastOutcome, setLastOutcome] = useState<unknown>(null);
  const refreshQueue = useRef(Promise.resolve());
  function refreshPractice(complete = false) {
    refreshQueue.current = refreshQueue.current.then(async () => {
      const current = session.current;
      const opened = store.current;
      if (!current || !opened) return;
      try {
        await current.recorder.flush();
        const records = await opened.workspaceRecords();
        const gate = completionEligibility({
          records,
          issue: issue.slug,
          revision: issue.revision,
          revisionFor: (id) => revisions[id],
          currentFiles: current.code(),
        });
        const terminal = records
          .flatMap((r) => {
            try {
              const v = JSON.parse(r.payload);
              return v.type === "observation.workspace.run" &&
                v.data?.runId === gate.latest?.runId &&
                v.data.outcome
                ? [v.data.outcome]
                : [];
            } catch {
              return [];
            }
          })
          .at(-1);
        if (session.current !== current) return;
        setVerification(gate);
        setLastOutcome(terminal ?? null);
        if (complete && gate.blocker === null && readProfile()?.accepted) {
          await completePractice(opened, {
            participantId: participant.current,
            termsVersion: readProfile()!.accepted!.version,
            issue: { ...issue, language: issue.language },
            revisionFor: (id) => revisions[id],
            currentFiles: () => current.code(),
            ready: () => {
              const state = current.saveStatus();
              return (
                session.current === current &&
                !runner.current?.running &&
                state.recoverable &&
                !state.buffered &&
                !state.retrying
              );
            },
          });
          setVerification(
            completionEligibility({
              records: await opened.workspaceRecords(),
              issue: issue.slug,
              revision: issue.revision,
              revisionFor: (id) => revisions[id],
              currentFiles: current.code(),
            }),
          );
        }
      } catch (error) {
        console.warn("Practice verification could not be saved.", error);
        setVerification((current) =>
          current ? { ...current, blocker: "code-unconfirmed" } : null,
        );
        setMessage("Your result could not be saved. Submit again to retry.");
      }
    });
  }
  function submit(how: "pointer" | "keyboard") {
    if (runner.current?.running || runtime.state !== "ready") return;
    setStale(false);
    void session.current?.pullRequest(how);
  }

  const mainRef = useRef<HTMLElement>(null);
  const board = useBoard();
  const currentProblem = candidates.find((i) => i.key === issue.key);
  const next = currentProblem
    ? nextProblem(currentProblem, candidates, board.items)
    : null;
  // The session's callbacks outlive renders; they read the latest board through this.
  const done = statusOf(board.items, issue.key) === "done";
  /** The pull request new work is pushed to: the latest one, unless it was merged or closed. */
  const openPull =
    pulls[0] &&
    !done &&
    pulls[0].result !== "merged" &&
    !merged.has(pulls[0].number) &&
    !closed.has(pulls[0].number)
      ? pulls[0]
      : null;
  const openPullRef = useRef(openPull);
  openPullRef.current = openPull;
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(issue.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const types = useRef<TypeChecker | null>(null);
  const store = useRef<PracticeStore | null>(null);
  // Each mount (twice in development) bumps this; a superseded open installs nothing.
  const generation = useRef(0);
  const participant = useRef("");
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
      const all = await store.current.workspaceRecords();
      // Only the attempt under way (a replay starts a new one); earlier ones stay recorded.
      const records = attemptRecords(all, issue.slug);
      const recovered: RecoveredCode | null = latestSavedCode(
        records,
        participantId,
        issue.slug,
      );
      const history = pullRequestHistory(records, participantId, issue.slug);
      // Numbers continue across attempts, so they come from every pull request.
      const numbered = pullRequestHistory(all, participantId, issue.slug);
      const mergedNumbers = mergedPullRequests(all, issue.slug);
      const closedNumbers = closedPullRequests(all, issue.slug);
      const homeHost = hosts.current.get(home);
      // A superseded open must not create a session or record anything.
      if (!homeHost || !current()) return;
      if (recovered) {
        const dropped = Object.keys(recovered.files).filter(
          (path) => !editable.some((f) => f.path === path),
        );
        setMessage(
          [
            recoveryMessage(recovered),
            records.some((r) => {
              try {
                const o = JSON.parse(r.payload);
                return (
                  o.type === "observation.workspace.opened" &&
                  o.issue === issue.slug &&
                  o.issueRevision !== issue.revision
                );
              } catch {
                return false;
              }
            })
              ? `The challenge changed since your last visit. Your matching files were restored.${dropped.length ? ` Files no longer present: ${dropped.join(", ")}.` : " Review the current requirements before checking again."}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      savedScope.current = `${participantId}:${viewScope(issue.slug, attemptAt(all, issue.slug).start)}`;
      const saved = readView(savedScope.current);
      if (saved) {
        const fitted = fitView(saved, {
          paths: editable.map((f) => f.path),
          tabs: [home, ...editable.map((f) => f.path)],
          lengths: Object.fromEntries(
            editable.map((f) => [
              f.path,
              (recovered?.files[f.path] ?? f.text).length,
            ]),
          ),
        });
        setTabs([...fitted.tabs]);
        setActive(
          editable.some((file) => file.path === fitted.active)
            ? fitted.active
            : home,
        );
        setPanel(fitted.panel === "output" ? "output" : "tests");
        pendingPlaces.current = { ...fitted.files };
      }
      setPulls(history);
      setMerged(mergedNumbers);
      setClosed(closedNumbers);
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
          repo.files
            .filter((f) => f.role === "read")
            .map((f) => [f.path, f.text]),
        ),
        restoredFrom: recovered?.revision,
        language: issue.language,
        keymap: keys,
        types: types.current ?? undefined,
        runtime: issue.runnable && engine ? engine.runtime : null,
        pullRequestsBefore: numbered[0]?.number ?? 0,
        hasPreviousChecks: numbered.length > 0,
        openPullRequest: () => {
          const open = openPullRef.current;
          return open ? { number: open.number, pushes: open.pushes } : null;
        },
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onSubmit: (how) => {
          if (runtimeNow.current.state === "ready")
            void session.current?.pullRequest(how);
        },
        onRun: (next) => {
          setRun(next);
          setStale(next.revision !== session.current?.currentRevision);
          const pr = next.pullRequest;
          // Terminal full-suite runs may complete; example runs cannot.
          if (next.status !== "queued" && next.status !== "running")
            void refreshPractice(next.purpose === "pull-request");
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
          // Keep internal submission numbering for backward-compatible capture.
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
        onVimMode: setVimMode,
        entry: entryPath(),
        profile: account?.profile ? ({ ...account.profile } as Json) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      // The home file mounts last, so it has the focus.
      for (const file of editable)
        if (file.path !== home)
          session.current.mount(file.path, hosts.current.get(file.path)!);
      session.current.mount(home, homeHost);
      session.current.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setOpening({ state: "open" });
      void refreshPractice();
    } catch (cause) {
      console.warn("The IDE could not open.", cause);
      if (current())
        setOpening({
          state: "failed",
          message:
            "The editor couldn't restore your code. Close other tabs with this challenge open, then reload the page.",
        });
    }
  }

  useEffect(() => {
    const attempt = ++generation.current;
    startRuntime();
    if (checksTypes(issue.language))
      types.current = new TypeChecker(challenge.entry);
    void open(() => attempt === generation.current);
    const saveView = () => persistView();
    window.addEventListener("pagehide", saveView);
    const timer = setInterval(() => {
      persistView();
      // Counts refresh each second; state changes arrive at once through onSaveStatus.
      setCapture(session.current?.saveStatus() ?? null);
    }, 1000);
    // Practice shows requirements directly; no hidden hint/comment releases are generated.
    return () => {
      window.removeEventListener("pagehide", saveView);
      generation.current++;
      persistView();
      clearInterval(timer);

      runner.current?.dispose();
      runner.current = null;
      types.current?.dispose();
      types.current = null;
      // The session flushes its last writes on close; the store stays open for them.
      const closing = session.current;
      session.current = null;
      void closing?.close();
    };
  }, []);

  /** The last input, so a navigation can say whether a person or the app made it. */
  const input = useRef<{ kind: "pointer" | "keyboard"; at: number } | null>(
    null,
  );
  const via = (): "pointer" | "keyboard" | "app" =>
    input.current && performance.now() - input.current.at < 1000
      ? input.current.kind
      : "app";
  useEffect(
    () => setIssueContext({ id: issue.slug, revision: issue.revision }),
    [issue.slug, issue.revision],
  );

  // The page: visible or hidden, focused or not, its size, and its last moments.
  useEffect(() => {
    const noteInput = (kind: "pointer" | "keyboard") => () =>
      (input.current = { kind, at: performance.now() });
    const pointer = noteInput("pointer");
    const keyboard = noteInput("keyboard");
    let resize: ReturnType<typeof setTimeout> | undefined;
    const page = () =>
      session.current?.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
    const resized = () => {
      clearTimeout(resize);
      resize = setTimeout(page, 250);
    };
    const hidden = () => session.current?.pageHidden();
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    document.addEventListener("visibilitychange", page);
    window.addEventListener("focus", page);
    window.addEventListener("blur", page);
    window.addEventListener("resize", resized);
    window.addEventListener("pagehide", hidden);
    return () => {
      clearTimeout(resize);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("visibilitychange", page);
      window.removeEventListener("focus", page);
      window.removeEventListener("blur", page);
      window.removeEventListener("resize", resized);
      window.removeEventListener("pagehide", hidden);
    };
  }, []);

  // What was open: tabs opened and closed, the file shown, the side bar and the panel.
  const shownTabs = useRef<string[]>([]);
  const isOpen = opening.state === "open";
  useEffect(() => {
    const current = session.current;
    if (!isOpen || !current) return;
    const before = shownTabs.current;
    for (const path of tabs)
      if (!before.includes(path))
        current.navigated("file", "open", path, via());
    for (const path of before)
      if (!tabs.includes(path)) current.navigated("file", "close", path, via());
    shownTabs.current = tabs;
  }, [tabs, isOpen]);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const how = via();
    const place = pendingPlaces.current[active];
    session.current?.restorePlace(
      active,
      place,
      how !== "app" || Boolean(place),
    );
    delete pendingPlaces.current[active];
    session.current?.navigated("file", "show", active, how);
    // Opening a file is investigation, which teammates may respond to.
    // File navigation keeps its existing observation; it does not release invisible hints.
  }, [active, isOpen]);
  useEffect(() => {
    if (isOpen) session.current?.navigated("side", "show", view, via());
  }, [view, isOpen]);
  useEffect(() => {
    if (isOpen) session.current?.navigated("panel", "show", panel, via());
  }, [panel, isOpen]);
  useEffect(() => {
    if (!isOpen || runtime.state === "none") return;
    session.current?.runtimeState(
      runtime.state,
      runtime.state === "unavailable" ? runtime.message : undefined,
    );
  }, [runtime.state, isOpen]);

  const running = run?.status === "queued" || run?.status === "running";
  const ready = runtime.state === "ready" && opening.state === "open";
  const publishedExamples = challenge.cases.filter((c) => c.visible);
  const check = checkFeedbackOf({
    blocker: stale
      ? "code-changed"
      : verification?.latest
        ? verification.blocker
        : undefined,
    completed:
      !running &&
      !stale &&
      run?.purpose !== "local" &&
      verification?.blocker === null &&
      !!verification.completedAt,
    running: !!running,
    latest: verification?.latest ?? null,
    diagnosis: diagnose(lastOutcome, challenge.cases),
    required: verification?.required ?? [],
  });
  const verified =
    !running &&
    !stale &&
    run?.purpose !== "local" &&
    verification?.blocker === null &&
    verification.completedInAttempt;
  return (
    <div className="practice" onClickCapture={persistView}>
      <header className="practice-header">
        <Link href="/issues">← Explore</Link>
        <span>
          Practice <span className="faint">· {issue.key}</span>
        </span>
        <Link href="/profile">Profile</Link>
      </header>
      <main className="practice-layout" ref={mainRef}>
        <section className="practice-challenge" aria-label="Challenge">
          <p className="eyebrow">Challenge · {languageLabel(issue.language)}</p>
          <h1>{issue.title}</h1>
          <h2>Goal and requirements</h2>
          <Markdown source={issue.task} />
          {revision.team.some((r) => r.severity === "blocking") && (
            <section className="practice-requirements">
              <h2>Required checks</h2>
              {revision.team
                .filter((r) => r.severity === "blocking")
                .map((r) => (
                  <Markdown key={r.id} source={r.text[0]} />
                ))}
            </section>
          )}
          {issue.comments.length > 0 && (
            <section className="practice-requirements">
              <h2>Notes and constraints</h2>
              {issue.comments.map((note, index) => (
                <Markdown key={index} source={note.body} />
              ))}
            </section>
          )}
          {repo.files.some(
            (f) => f.role === "read" && !/readme\.md$/i.test(f.path),
          ) && (
            <details className="practice-context" open>
              <summary>Supporting material</summary>
              {repo.files
                .filter(
                  (f) => f.role === "read" && !/readme\.md$/i.test(f.path),
                )
                .map((file) => (
                  <section key={file.path}>
                    <h3>{file.path}</h3>
                    <pre>{file.text}</pre>
                  </section>
                ))}
            </details>
          )}
          {challenge.schema && (
            <details open>
              <summary>Data schema</summary>
              <pre>{challenge.schema}</pre>
            </details>
          )}
          <ChallengeExamples examples={publishedExamples} />
          <CopyIssueLink issueKey={issue.key} />
        </section>
        <section className="practice-work" aria-label="Your code">
          <div className="practice-code-head">
            <h2>Your code</h2>
            {editable.length > 1 && (
              <label>
                Source{" "}
                <select
                  aria-label="Editable source"
                  value={active}
                  onChange={(event) => setActive(event.target.value)}
                >
                  {editable.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="faint">
              {keymap === "vim" ? `Vim · ${vimMode}` : "Standard keys"}
            </span>
          </div>
          <div className="practice-editors">
            {editable.map((file) => (
              <div
                key={file.path}
                className="practice-editor"
                hidden={file.path !== active}
                ref={(node) => {
                  if (node) hosts.current.set(file.path, node);
                }}
              />
            ))}
            {opening.state === "opening" && (
              <p role="status">Restoring your code…</p>
            )}
            {opening.state === "failed" && (
              <p className="error" role="alert">
                {opening.message}
              </p>
            )}
          </div>
          <div className="practice-controls">
            <span role="status">
              {capture ? saveBadge(capture).label : "Opening…"}
              {offline ? " · Offline" : ""}
            </span>
            {runtime.state === "loading" && (
              <span role="status">Preparing checks… You can keep editing.</span>
            )}
            {runtime.state === "unavailable" ? (
              <button
                type="button"
                className="btn primary"
                onClick={startRuntime}
              >
                Retry checks
              </button>
            ) : running ? (
              <button className="btn" onClick={() => session.current?.cancel()}>
                Cancel check
              </button>
            ) : (
              <>
                <button
                  className="btn"
                  disabled={!ready}
                  onClick={(event) =>
                    void session.current?.run(
                      "local",
                      event.detail === 0 ? "keyboard" : "pointer",
                    )
                  }
                >
                  Run examples
                </button>
                <button
                  className={`btn${verified ? "" : " primary"}`}
                  disabled={!ready}
                  onClick={(event) =>
                    submit(event.detail === 0 ? "keyboard" : "pointer")
                  }
                >
                  Submit <Shortcut />
                </button>
              </>
            )}
          </div>
          {message && (
            <p className="practice-notice" role="status">
              {message}
            </p>
          )}
          <div className="practice-feedback">
            {run?.purpose === "local" ? (
              <>
                <h2>Example feedback</h2>
                <Tests
                  challenge={challenge}
                  run={run}
                  stale={stale}
                  issue={issue}
                  testsPath="the public examples"
                  runtime={runtime}
                  onRetry={startRuntime}
                />
              </>
            ) : (
              <CheckFeedbackView feedback={check} />
            )}
            {verified && (
              <section className="practice-next" aria-label="Next challenge">
                <h2>
                  {verification.completedAt
                    ? "Next challenge"
                    : "Current code verified"}
                </h2>
                {next ? (
                  <>
                    <p>Next: {next.title}</p>
                    <StartWork
                      issue={next}
                      href={`/work/${next.key}`}
                      label="Next challenge"
                    />
                    <p className="faint">
                      Suggested by language, project and difficulty.
                    </p>
                  </>
                ) : (
                  <Link className="btn primary" href="/issues">
                    Explore challenges
                  </Link>
                )}
                <Link href="/profile">View your evidence</Link>
              </section>
            )}
            {run && (
              <details
                open={panel === "output"}
                onToggle={(event) =>
                  setPanel(event.currentTarget.open ? "output" : "tests")
                }
              >
                <summary>Output</summary>
                <Output
                  run={run}
                  challenge={challenge}
                  runtime={engine?.label ?? issue.language}
                />
              </details>
            )}
          </div>
          <p className="practice-keys faint">
            <Shortcut /> submits · Escape, then Tab leaves the editor.{" "}
            <Link href="/settings?run=editor">Editor keys</Link>
          </p>
        </section>
      </main>
      <div ref={sandboxHost} hidden />
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
  /** The cases in the repo's test file, which Run tests runs. */
  const visible = casesRun(challenge.cases, "local").length;
  if (!issue.runnable)
    return (
      <p className="faint">
        This repo has no test runner set up yet. Your edits are saved as you go;
        the {visible} cases are in {testsPath}.
      </p>
    );
  if (runtime.state === "unavailable")
    return (
      <p className="error" role="alert">
        Your environment couldn&apos;t be set up.{" "}
        <button type="button" className="ide-link" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  if (!run)
    return (
      <p className="faint">
        Start in {challenge.entry}: change the code to meet the requirements,
        then run tests (<Shortcut />
        ). {visible} acceptance checks are in {testsPath}.
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
        The test runner crashed; this wasn&apos;t your code. Run the tests
        again.
      </p>
    );
  if (o.error && o.phase !== "tests")
    return (
      <pre className="ide-trace">
        {o.error.traceback.text || `${o.error.type}: ${o.error.message}`}
      </pre>
    );
  const cases = casesRun(challenge.cases, run.purpose);
  const feedback = runFeedback(cases, o.cases);
  const failed = feedback.total - feedback.correct;
  return (
    <div>
      <p className="ide-run-label faint">Public examples</p>
      <p className={`ide-summary ${failed ? "fail" : "pass"}`}>
        {failed ? "✘" : "✔"} {feedback.correct} passed
        {failed > 0 && `, ${failed} failed`} · {o.durationMs} ms
        {stale && <span className="faint"> · you&apos;ve edited since</span>}
      </p>
      <ol className="ide-cases">
        {cases.map((check, index) => (
          <Case
            key={index}
            index={index}
            label={
              check.visible
                ? (check.name ?? caseLabel(challenge, check.input))
                : `Additional check ${index + 1}`
            }
            visible={check.visible}
            expected={check.visible ? check.expected : undefined}
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
  visible,
  passed,
  result,
}: {
  index: number;
  label: string;
  expected?: unknown;
  visible: boolean;
  passed: boolean;
  result?: CaseResult;
}) {
  return (
    <li className={passed ? "pass" : "fail"}>
      <span className="ide-case-mark">{passed ? "✔" : "✘"}</span>
      <span className="ide-case-body">
        <code>{label}</code>
        {!passed && !visible && (
          <span className="ide-case-detail">{privateCheckFailure(result)}</span>
        )}
        {!passed && visible && (
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

function entryPath(): string | null {
  // Client navigation leaves document.referrer at the first page loaded; the tracker notes
  // the page before this one.
  try {
    const previous = sessionStorage.getItem(PREVIOUS_PATH_KEY);
    if (previous && !previous.startsWith("/work/")) return previous;
  } catch {
    // Fall back to the referrer.
  }
  try {
    const from = new URL(document.referrer);
    return from.origin === location.origin ? from.pathname + from.search : null;
  } catch {
    return null;
  }
}

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

function Shortcut({ shift = false }: { shift?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <kbd>
      {mac ? "⌘" : "Ctrl+"}
      {shift ? (mac ? "⇧" : "Shift+") : ""}
      {mac ? "↵" : "Enter"}
    </kbd>
  );
}
