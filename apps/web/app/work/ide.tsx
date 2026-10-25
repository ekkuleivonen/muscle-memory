"use client";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../../packages/domain/workspace";
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
import { languageLabel } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import { mediaTypeOf, type FileLanguage } from "../../lib/repo";
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
import { TermFooter, type Crumb } from "../_terminal/footer";
import {
  CHALLENGE,
  CODE_MIN,
  FEEDBACK,
  Splitter,
  usePracticeLayout,
} from "./splitter";
import { privateCheckFailure } from "./check-feedback";
import {
  completionEligibility,
  type CompletionGate,
} from "../../lib/completion";
import { completePractice } from "../../lib/complete-practice";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { CheckFeedbackView } from "../(browse)/_components/review";
import { CopyIssueLink, ShareOutcome } from "../(browse)/_components/share";
import { shareCompletionProof } from "../../lib/share-completion";
import { incompatibleSavedPaths } from "../../lib/practice-contract";
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
  language: LanguageId;
  runnable: boolean;
}

type Runtime =
  | { state: "none" }
  | { state: "loading"; progress?: LoadProgress }
  | { state: "ready" }
  | { state: "unavailable"; message: string };

type Opening =
  | { state: "recovery"; paths: string[] }
  | { state: "opening" }
  | { state: "open" }
  | { state: "failed"; message: string };

/**
 * One editable challenge entry, immediate feedback and continuation. Support/test files
 * stay internal; recorded work remains pinned to its published revision.
 */
export function Ide({
  revisionsJson,
  candidates,
  issue,
  trail,
}: {
  /**
   * Every published revision of the issue by id, as a JSON string: React's serializer would
   * drop a "__proto__" fixture key. The IDE opens the live one; feedback recorded against
   * earlier ones is read from theirs.
   */
  revisionsJson: string;
  /** Where the challenge sits, for the status bar's breadcrumb trail. */
  trail: readonly Crumb[];
  candidates: IssueSummary[];
  issue: IdeIssue;
}) {
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const revision = revisions[issue.revision];
  const challenge = useMemo(() => executableOf(revision), [revision]);
  const home = revision.workspace.entry;
  const source = revision.workspace.files[home];
  const editable = [{ path: home, ...source }];
  const view = "ticket" as const; // Existing observation value for the visible challenge.
  const tabs = useMemo(() => [home], [home]); // View continuity metadata only; there is no project navigation UI.
  const active = home;
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
  const [shareSnapshot, setShareSnapshot] = useState<{
    records: readonly WorkspaceRecord[];
    proof: NonNullable<ReturnType<typeof shareCompletionProof>>;
  } | null>(null);
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
        }
        const snapshot = complete ? await opened.workspaceRecords() : records;
        if (session.current !== current) return;
        const state = current.saveStatus();
        const proof = shareCompletionProof({
          records: snapshot,
          issue: issue.slug,
          revision: issue.revision,
          revisionFor: (id) => revisions[id],
          currentFiles: current.code(),
          ready:
            !runner.current?.running &&
            state.recoverable &&
            !state.buffered &&
            !state.retrying,
        });
        setShareSnapshot(proof ? { records: snapshot, proof } : null);
        setVerification(
          completionEligibility({
            records: snapshot,
            issue: issue.slug,
            revision: issue.revision,
            revisionFor: (id) => revisions[id],
            currentFiles: current.code(),
          }),
        );
      } catch (error) {
        setShareSnapshot(null);
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
  const challengePane = useRef<HTMLElement>(null);
  const resultsPane = useRef<HTMLElement>(null);
  const { layout, update: resize } = usePracticeLayout();
  const challengeBody = useRef<HTMLDivElement>(null);
  const resultsBody = useRef<HTMLDivElement>(null);
  // 1, 2 and 3 move between the panes, lazygit-style, whenever focus is not somewhere that
  // types: Escape then Tab leaves the editor first. Never a chord inside the editor, where
  // AltGr and Ctrl with digits already type characters or switch browser tabs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], .cm-editor",
        )
      )
        return;
      const pane = {
        "1": () => challengeBody.current,
        "2": () =>
          hosts.current.get(home)?.querySelector<HTMLElement>(".cm-content"),
        "3": () => resultsBody.current,
      }[event.key];
      const node = pane?.();
      if (!node) return;
      event.preventDefault();
      node.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [home]);
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
  async function open(
    current: () => boolean,
    recoveryChoice?: "entry" | "starter",
  ) {
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
      const savedCode: RecoveredCode | null = latestSavedCode(
        records,
        participantId,
        issue.slug,
      );
      const dropped = savedCode
        ? incompatibleSavedPaths(revision, savedCode.files)
        : [];
      if (dropped.length && !recoveryChoice) {
        if (current()) setOpening({ state: "recovery", paths: dropped });
        return;
      }
      const recovered = recoveryChoice === "starter" ? null : savedCode;
      const history = pullRequestHistory(records, participantId, issue.slug);
      // Numbers continue across attempts, so they come from every pull request.
      const numbered = pullRequestHistory(all, participantId, issue.slug);
      const mergedNumbers = mergedPullRequests(all, issue.slug);
      const closedNumbers = closedPullRequests(all, issue.slug);
      const homeHost = hosts.current.get(home);
      // A superseded open must not create a session or record anything.
      if (!homeHost || !current()) return;
      if (recovered) {
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
              ? `The challenge changed since your last visit. Your matching files were restored.${dropped.length ? ` You chose not to restore ${dropped.join(", ")}; those files remain in history.` : " Review the current requirements before checking again."}`
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
              language: f.language as FileLanguage,
              mediaType: mediaTypeOf(f.language as LanguageId),
            },
          ]),
        ),
        sources: Object.fromEntries(
          Object.entries(revision.workspace.files)
            .filter(([, file]) => file.role === "read")
            .map(([path, file]) => [path, file.text]),
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
    <div className="practice tui" onClickCapture={persistView}>
      <main
        className="tui-panes"
        ref={mainRef}
        style={
          {
            ...(layout.challenge !== null && {
              "--challenge-w": `${layout.challenge}px`,
            }),
            ...(layout.feedback !== null && {
              "--feedback-h": `${layout.feedback}px`,
            }),
          } as CSSProperties
        }
      >
        <section
          className="pane practice-challenge"
          aria-label="Challenge"
          ref={challengePane}
        >
          <h2 className="pane-title">
            <kbd>[1]</kbd> challenge{" "}
            <span className="faint">· {issue.key}</span>
          </h2>
          <div className="pane-body" tabIndex={0} ref={challengeBody}>
            <h1>{issue.title}</h1>
            <h2>Goal and requirements</h2>
            <Markdown source={issue.task} />
            {challenge.schema && (
              <details open>
                <summary>Data schema</summary>
                <pre>{challenge.schema}</pre>
              </details>
            )}
            <ChallengeExamples examples={publishedExamples} compact />
            <CopyIssueLink issueKey={issue.key} />
          </div>
        </section>
        <Splitter
          axis="x"
          label="Resize the challenge pane"
          value={() => challengePane.current?.offsetWidth ?? 0}
          min={CHALLENGE.min}
          max={() => (mainRef.current?.clientWidth ?? 0) - CODE_MIN.width}
          onChange={(width) => resize({ challenge: width })}
          onReset={() => resize({ challenge: null })}
        />
        <section className="pane practice-work" aria-label="Your code">
          <h2 className="pane-title">
            <kbd>[2]</kbd> code{" "}
            <span className="faint">
              · {languageLabel(issue.language)} ·{" "}
              {keymap === "vim" ? `vim ${vimMode}` : "standard keys"}
            </span>
          </h2>
          <div className="practice-editors">
            <div
              className="practice-editor"
              hidden={
                opening.state === "recovery" || opening.state === "failed"
              }
              ref={(node) => {
                if (node) hosts.current.set(home, node);
              }}
            />
            {opening.state === "recovery" && (
              <section
                className="practice-recovery"
                aria-label="Saved version recovery"
              >
                <h2>Your saved version used more than one file</h2>
                <p>
                  The current version is a single-file challenge. These saved
                  files remain in history but cannot be restored here:{" "}
                  {opening.paths.join(", ")}.
                </p>
                <p>
                  Use the current starter, or explicitly restore only your
                  matching entry code. Earlier records and files remain
                  unchanged.
                </p>
                <button
                  className="btn primary"
                  onClick={() => {
                    const attempt = generation.current;
                    setOpening({ state: "opening" });
                    void open(() => attempt === generation.current, "starter");
                  }}
                >
                  Use current starter
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const attempt = generation.current;
                    setOpening({ state: "opening" });
                    void open(() => attempt === generation.current, "entry");
                  }}
                >
                  Restore saved entry only
                </button>
              </section>
            )}
            {opening.state === "opening" && (
              <p role="status">Restoring your code…</p>
            )}
            {opening.state === "failed" && (
              <p className="error" role="alert">
                {opening.message}
              </p>
            )}
          </div>
          {opening.state !== "recovery" && (
            <div className="practice-controls">
              <span role="status">
                {capture ? saveBadge(capture).label : "Opening…"}
                {offline ? " · Offline" : ""}
              </span>
              {runtime.state === "loading" && (
                <span role="status">
                  Preparing checks… You can keep editing.
                </span>
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
                <button
                  className="btn"
                  onClick={() => session.current?.cancel()}
                >
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
          )}
        </section>
        <Splitter
          axis="y"
          label="Resize the feedback pane"
          value={() => resultsPane.current?.offsetHeight ?? 0}
          min={FEEDBACK.min}
          max={() => (mainRef.current?.clientHeight ?? 0) - CODE_MIN.height}
          onChange={(height) => resize({ feedback: height })}
          onReset={() => resize({ feedback: null })}
        />
        <section
          className="pane practice-results"
          aria-label="Feedback"
          ref={resultsPane}
        >
          <h2 className="pane-title">
            <kbd>[3]</kbd> feedback
          </h2>
          <div className="pane-body" tabIndex={0} ref={resultsBody}>
            {message && (
              <p className="practice-notice" role="status">
                {message}
              </p>
            )}
            {opening.state === "open" && (
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
                  <section
                    className="practice-next"
                    aria-label="Next challenge"
                  >
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
                          Suggested by language and difficulty.
                        </p>
                      </>
                    ) : (
                      <Link className="btn primary" href="/challenges">
                        Explore challenges
                      </Link>
                    )}
                    {shareSnapshot &&
                      shareSnapshot.proof.completion.runId ===
                        verification.latest?.runId &&
                      shareSnapshot.proof.completion.at ===
                        verification.completedAt && (
                        <ShareOutcome
                          challenge={issue}
                          completion={shareSnapshot.proof.completion}
                          required={shareSnapshot.proof.required}
                          records={shareSnapshot.records}
                          revisions={revisions}
                        />
                      )}
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
            )}
          </div>
        </section>
      </main>
      <p className="tui-status">
        <span>
          <Shortcut /> submits · Esc, then Tab leaves the editor · 1 2 3 switch
          panes · <Link href="/settings/profile/editor">editor keys</Link>
        </span>
      </p>
      <TermFooter trail={trail} />
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
