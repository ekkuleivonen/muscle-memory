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
import { latestSavedCode } from "../../../../packages/capture/restore";
import {
  casesRun,
  executableOf,
  type Difficulty,
  type Revision,
} from "../../../../packages/content/model";
import { runFeedback, type StoredRecord } from "../../../../packages/domain/records";
import type { Json } from "../../../../packages/domain/json";
import {
  engineFor,
  Runner,
  type CaseResult,
  type LoadProgress,
} from "../../../../packages/runner/runner";
import { readProfile } from "../../lib/account";
import { languageLabel } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import { mediaTypeOf, type FileLanguage } from "../../lib/entry";
import { environmentOf } from "../../lib/environment";
import { attemptFor, complete, readProgress, writeProgress } from "../../lib/progress";
import { useProgress, useStars } from "../../lib/progress-hooks";
import { noteStart, takeStart } from "../../lib/start";
import { toggleStar, writeStars } from "../../lib/stars";
import {
  logStar,
  PREVIOUS_PATH_KEY,
  setChallengeContext,
} from "../../lib/site-log";
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
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { CheckFeedbackView } from "../(browse)/_components/review";
import { CopyIssueLink, ShareOutcome } from "../(browse)/_components/share";
import { nextProblem } from "../../lib/next-problem";
import { isPracticePath, practiceHref } from "../../lib/paths";
import type { IssueSummary } from "../../lib/library";

export interface IdeIssue {
  key: string;
  slug: string;
  /** The live revision the IDE opens: sha256:… of its content. */
  revision: string;
  title: string;
  task: string;
  difficulty?: Difficulty;
  tags: string[];
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

const randomAttempt = () => `attempt-${crypto.randomUUID()}`;

/** Every observation of one attempt at one challenge, parsed. */
function attemptObservations(records: readonly StoredRecord[], challenge: string, attempt: string) {
  return records.flatMap((r) => {
    if (r.kind !== "observation") return [];
    try {
      const o = JSON.parse(r.payload);
      return o.challenge === challenge && o.attemptId === attempt ? [o] : [];
    } catch {
      return [];
    }
  });
}

/**
 * One editable challenge entry, immediate feedback and continuation. Support/test files
 * stay internal. Practice works in an attempt (lib/progress.ts): opening resumes it, and a
 * start after a completed attempt begins a new one.
 */
export function Ide({
  revisionsJson,
  candidates,
  issue,
  trail,
}: {
  /**
   * The challenge's live revision by id, as a JSON string: React's serializer would drop a
   * "__proto__" fixture key.
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
  const [outputOpen, setOutputOpen] = useState(false);
  const savedScope = useRef<string | null>(null);
  const pendingPlaces = useRef<Record<string, FileView>>({});
  const panelNow = useRef<"tests" | "output">("tests");
  panelNow.current = outputOpen ? "output" : "tests";
  const persistView = () => {
    if (savedScope.current && session.current)
      writeView({
        scope: savedScope.current,
        tabs: [home],
        active: home,
        side: "ticket",
        panel: panelNow.current,
        files: { ...session.current.places(), ...pendingPlaces.current },
        savedAt: new Date().toISOString(),
      });
  };
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
  /** The latest submission in this page, with its verdict. */
  const [submission, setSubmission] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  const [capture, setCapture] = useState<SaveStatus | null>(null);
  const [keymap, setKeymap] = useState<Keymap>("standard");
  const [vimMode, setVimMode] = useState("normal");
  /** The attempt under way, and whether it is completed. */
  const [attempt, setAttempt] = useState<{ id: string; completed: boolean } | null>(null);
  /** The store's records once the attempt completed, for the share card. */
  const [shareRecords, setShareRecords] = useState<readonly StoredRecord[] | null>(null);

  function submit(how: "pointer" | "keyboard") {
    if (runner.current?.running || runtimeNow.current.state !== "ready") return;
    setStale(false);
    void session.current?.submit(how);
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
  const progress = useProgress();
  const stars = useStars();
  const starred = stars.includes(issue.key);
  const star = () => {
    writeStars(toggleStar(stars, issue.key));
    void logStar(
      { id: issue.slug, revision: issue.revision },
      !starred,
      { challengeKey: issue.key, from: "practice" },
    );
  };
  const completedKeys = useMemo(
    () =>
      new Set(
        Object.values(progress)
          .filter((p) => p.completions > 0)
          .map((p) => p.key),
      ),
    [progress],
  );
  const currentProblem = candidates.find((i) => i.key === issue.key);
  const next = currentProblem
    ? nextProblem(currentProblem, candidates, completedKeys, readProfileLanguages())
    : null;
  // The session's callbacks outlive renders; they read the latest suggestion through this.
  const nextRef = useRef(next);
  nextRef.current = next;
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(issue.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const types = useRef<TypeChecker | null>(null);
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

  /** The attempt completed: progress says so, and the share card reads the records. */
  async function completed(current: WorkspaceSession, attemptId: string) {
    writeProgress(complete(readProgress(), issue.slug, attemptId, new Date().toISOString()));
    if (session.current !== current) return;
    setAttempt({ id: attemptId, completed: true });
    try {
      await current.recorder.flush();
      const records = await store.current!.records();
      if (session.current === current) setShareRecords(records);
    } catch (error) {
      console.warn("The result card could not be read.", error);
    }
  }

  /** Opens the attempt under way (or a new one), restoring its latest saved code. */
  async function open(current: () => boolean) {
    try {
      const account = readProfile();
      const keys: Keymap =
        account?.profile.editor === "vim" ? "vim" : "standard";
      setKeymap(keys);
      store.current ??= await openPracticeStore();
      const participantId = await store.current.participantId();
      const environment = await environmentOf();
      const records = await store.current.records();
      const homeHost = hosts.current.get(home);
      // A superseded open must not create a session or record anything.
      if (!homeHost || !current()) return;
      const start = takeStart(issue.key);
      const now = new Date().toISOString();
      const chosen = attemptFor(
        readProgress(),
        { id: issue.slug, key: issue.key },
        start !== null,
        now,
        randomAttempt,
      );
      if (chosen.fresh) writeProgress(chosen.progress);
      const attemptId = chosen.attempt;
      const done = chosen.progress[issue.slug]?.completedAt != null;
      setAttempt({ id: attemptId, completed: done });
      if (done) setShareRecords(records);
      const observed = attemptObservations(records, issue.slug, attemptId);
      const recovered = latestSavedCode(records, participantId, issue.slug, attemptId);
      if (recovered)
        setMessage(
          [
            recoveryMessage(recovered),
            observed.some(
              (o) => o.type === "practice.opened" && o.challengeRevision !== issue.revision,
            )
              ? "The challenge changed since your last visit. Your code was restored; review the requirements before submitting again."
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      savedScope.current = `${participantId}:${viewScope(issue.slug, attemptId)}`;
      const saved = readView(savedScope.current);
      if (saved) {
        const fitted = fitView(saved, {
          paths: editable.map((f) => f.path),
          tabs: [home],
          lengths: Object.fromEntries(
            editable.map((f) => [
              f.path,
              (recovered?.files[f.path] ?? f.text).length,
            ]),
          ),
        });
        setOutputOpen(fitted.panel === "output");
        pendingPlaces.current = { ...fitted.files };
      }
      const opened: WorkspaceSession = new WorkspaceSession({
        participantId,
        termsVersion: account?.accepted?.version ?? "1970-01-01",
        challenge: {
          id: issue.slug,
          key: issue.key,
          revision,
          revisionId: issue.revision,
        },
        attemptId,
        started: chosen.fresh
          ? {
              challengeKey: issue.key,
              from: start?.from ?? "direct",
              query: start?.query ?? null,
              position: start?.position ?? null,
            }
          : null,
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
        hasPreviousChecks: observed.some((o) => o.type === "practice.submitted"),
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onSubmit: (how) => submit(how),
        suggestNext: () => nextRef.current?.key ?? null,
        onCompleted: () => void completed(opened, attemptId),
        onRun: (next) => {
          setRun(next);
          setStale(next.revision !== session.current?.currentRevision);
          if (next.purpose === "submit" && next.verdict) setSubmission(next);
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
        onVimMode: setVimMode,
        entry: entryPath(),
        profile: account?.profile ? ({ ...account.profile } as Json) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        environment,
      });
      session.current = opened;
      opened.mount(home, homeHost);
      opened.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setOpening({ state: "open" });
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

  useEffect(
    () => setChallengeContext({ id: issue.slug, revision: issue.revision }),
    [issue.slug, issue.revision],
  );

  // The page: visible or hidden, focused or not, its size, and its last moments.
  useEffect(() => {
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
    document.addEventListener("visibilitychange", page);
    window.addEventListener("focus", page);
    window.addEventListener("blur", page);
    window.addEventListener("resize", resized);
    window.addEventListener("pagehide", hidden);
    return () => {
      clearTimeout(resize);
      document.removeEventListener("visibilitychange", page);
      window.removeEventListener("focus", page);
      window.removeEventListener("blur", page);
      window.removeEventListener("resize", resized);
      window.removeEventListener("pagehide", hidden);
    };
  }, []);

  const isOpen = opening.state === "open";
  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = pendingPlaces.current[home];
    session.current?.restorePlace(home, place, Boolean(place));
    delete pendingPlaces.current[home];
  }, [home, isOpen]);
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
  const verdict = submission?.verdict ?? null;
  const done = !!attempt?.completed;
  const check = checkFeedbackOf({
    running: running && run?.purpose === "submit",
    completed: done && !stale && (!verdict || verdict.complete),
    edited: stale && !!verdict,
    verdict,
    diagnosis: verdict ? diagnose(submission?.outcome ?? null, challenge.cases) : null,
  });
  /** Practise this challenge again: a new attempt from the starting code. */
  const again = () => {
    noteStart({ key: issue.key, from: "again", query: null, position: null });
    window.location.assign(practiceHref(issue.key));
  };
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
            <span className="faint">· {issue.key}</span>{" "}
            <button
              type="button"
              className="pane-star"
              aria-pressed={starred}
              title={starred ? "Unstar" : "Star"}
              onClick={star}
            >
              {starred ? "★" : "☆"}
            </button>
          </h2>
          <div
            className="pane-body"
            tabIndex={0}
            ref={challengeBody}
            onCopy={() =>
              session.current?.copiedChallenge(
                window.getSelection()?.toString() ?? "",
              )
            }
          >
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
              hidden={opening.state === "failed"}
              ref={(node) => {
                if (node) hosts.current.set(home, node);
              }}
            />
            {opening.state === "opening" && (
              <p role="status">Restoring your code…</p>
            )}
            {opening.state === "failed" && (
              <p className="error" role="alert">
                {opening.message}
              </p>
            )}
          </div>
          {
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
                        "examples",
                        event.detail === 0 ? "keyboard" : "pointer",
                      )
                    }
                  >
                    Run examples
                  </button>
                  <button
                    className={`btn${done ? "" : " primary"}`}
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
          }
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
                {run?.purpose === "examples" ? (
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
                {done && attempt && (
                  <section
                    className="practice-next"
                    aria-label="Next challenge"
                  >
                    <h2>Next challenge</h2>
                    {next ? (
                      <>
                        <p>Next: {next.title}</p>
                        <Link
                          className="btn primary"
                          href={practiceHref(next.key)}
                          onClick={() =>
                            noteStart({ key: next.key, from: "next", query: null, position: null })
                          }
                        >
                          Next challenge →
                        </Link>{" "}
                        <button type="button" className="btn" onClick={again}>
                          Practise this again
                        </button>
                        <p className="faint">
                          Suggested by language and difficulty.
                        </p>
                      </>
                    ) : (
                      <>
                        <Link className="btn primary" href="/challenges">
                          Explore challenges
                        </Link>{" "}
                        <button type="button" className="btn" onClick={again}>
                          Practise this again
                        </button>
                      </>
                    )}
                    {shareRecords && (
                      <ShareOutcome
                        challenge={{ ...issue, id: issue.slug }}
                        attemptId={attempt.id}
                        records={shareRecords}
                        revision={revision}
                      />
                    )}
                  </section>
                )}
                {run && (
                  <details
                    open={outputOpen}
                    onToggle={(event) => setOutputOpen(event.currentTarget.open)}
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
  const visible = casesRun(challenge.cases, "examples").length;
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

/** The languages in the person's profile, for suggestions after the current one's run out. */
function readProfileLanguages(): string[] {
  if (typeof window === "undefined") return [];
  return [...(readProfile()?.profile.languages ?? [])];
}

function entryPath(): string | null {
  // Client navigation leaves document.referrer at the first page loaded; the tracker notes
  // the page before this one.
  try {
    const previous = sessionStorage.getItem(PREVIOUS_PATH_KEY);
    if (previous && !isPracticePath(previous)) return previous;
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
