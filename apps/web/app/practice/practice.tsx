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
  type Difficulty,
  type Revision,
} from "../../../../packages/content/model";
import {
  runFeedback,
  type StoredRecord,
} from "../../../../packages/domain/records";
import type { Json } from "../../../../packages/domain/json";
import {
  engineFor,
  Runner,
  type LoadProgress,
} from "../../../../packages/runner/runner";
import { readProfile } from "../../lib/account";
import { languageLabel } from "../../lib/challenges";
import type { FileLanguage, LanguageId } from "../../lib/languages";
import { environmentOf } from "../../lib/environment";
import {
  attemptFor,
  complete,
  readProgress,
  writeProgress,
  withReflection,
} from "../../lib/progress";
import { useProgress, useStars } from "../../lib/progress-hooks";
import { noteStart, takeStart } from "../../lib/start";
import { toggleStar, writeStars } from "../../lib/stars";
import {
  logStar,
  PREVIOUS_PATH_KEY,
  setChallengeContext,
} from "../../lib/site-log";
import { Markdown } from "../_components/markdown";
import { loadEditorModes, type Keymap } from "./editor";
import { checksTypes, TypeChecker } from "./type-checker";
import { transcript } from "./transcript";
import { recoveryMessage, saveBadge } from "./save-state";
import {
  RUN_TIMEOUT_MS,
  PracticeSession,
  type RunView,
  type SaveStatus,
} from "./session";

import { fitPlace, readView, writeView, type Place } from "./continuity";

import { ChallengeExamples } from "../_components/challenge-examples";
import { TermFooter, type Crumb } from "../_terminal/footer";
import {
  CHALLENGE,
  CODE_MIN,
  FEEDBACK,
  Splitter,
  usePracticeLayout,
} from "./splitter";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { CheckFeedbackView } from "../_components/review";
import { CompletionModelComparisons } from "./model-comparisons";
import { Reflection, reflectionFor, type ReflectionState } from "./reflection";
import { CopyChallengeLink, ShareOutcome } from "../_components/share";
import { DesktopFirst, useSolveHere } from "./desktop-first";
import { nextProblem } from "../../lib/next-problem";
import { isPracticePath, practiceHref } from "../../lib/paths";
import type { ChallengeSummary } from "../../lib/challenges";

export interface PracticeChallenge {
  key: string;
  /** The live revision practice opens: sha256:… of its content. */
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
function attemptObservations(
  records: readonly StoredRecord[],
  challenge: string,
  attempt: string,
) {
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

/** Where the panes stack and the page scrolls (as in practice.css): narrow windows, phones held sideways. */
const STACKED =
  "(max-width: 760px), (hover: none) and (pointer: coarse) and (max-height: 500px)";

/**
 * One editable challenge entry, immediate feedback and continuation. Support/test files
 * stay internal. Practice works in an attempt (lib/progress.ts): opening resumes it, and a
 * start after a completed attempt begins a new one.
 */
export function Practice({
  revisionJson,
  candidates,
  challenge,
  trail,
  allowRepeat = true,
}: {
  /**
   * The challenge's live revision by id, as a JSON string: React's serializer would drop a
   * "__proto__" fixture key.
   */
  revisionJson: string;
  allowRepeat?: boolean;
  /** Where the challenge sits, for the status bar's breadcrumb trail. */
  trail: readonly Crumb[];
  candidates: ChallengeSummary[];
  challenge: PracticeChallenge;
}) {
  const revision = useMemo(
    () => JSON.parse(revisionJson) as Revision,
    [revisionJson],
  );
  const [canSubmit, setCanSubmit] = useState(false);
  const reflectionNow = useRef<ReflectionState | undefined>(undefined);
  const reflectionAttempt = useRef<string | null>(null);
  const [reflection, setReflection] = useState<ReflectionState>();
  function saveReflection(value: ReflectionState) {
    reflectionNow.current = value;
    setReflection(value);
    const progress = readProgress();
    const current = progress[challenge.key];
    if (current && current.attempt === reflectionAttempt.current)
      writeProgress(
        withReflection(progress, challenge.key, current.attempt, value),
      );
  }
  const savedScope = useRef<string | null>(null);
  /** A saved place waiting for the editor to mount. */
  const pendingPlace = useRef<Place | null>(null);
  const persistView = () => {
    if (savedScope.current && session.current)
      writeView({
        scope: savedScope.current,
        place: pendingPlace.current ?? session.current.place(),
        outputOpen: true,
        savedAt: new Date().toISOString(),
      });
  };
  const [solveHere, chooseSolveHere] = useSolveHere();
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
    challenge.runnable ? { state: "loading" } : { state: "none" },
  );
  const runtimeNow = useRef(runtime);
  runtimeNow.current = runtime;
  const [run, setRun] = useState<RunView | null>(null);
  /** The latest submission in this page, with its verdict. */
  const [submission, setSubmission] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  // Only the badge's words, so the once-a-second refresh re-renders nothing when they hold.
  const [saveLabel, setSaveLabel] = useState<string | null>(null);
  const showSaveStatus = (status: SaveStatus | null | undefined) =>
    setSaveLabel(status ? saveBadge(status).label : null);
  const [keymap, setKeymap] = useState<Keymap>("standard");
  const [vimMode, setVimMode] = useState("normal");
  /** The attempt under way, and whether it is completed. */
  const [attempt, setAttempt] = useState<{
    id: string;
    completed: boolean;
  } | null>(null);
  const completionRead = useRef(0);
  /** The store's records once the attempt completed, for the share card. */
  const [shareRecords, setShareRecords] = useState<
    readonly StoredRecord[] | null
  >(null);

  function submit(how: "pointer" | "keyboard") {
    if (
      runner.current?.running ||
      runtimeNow.current.state !== "ready" ||
      !session.current?.canSubmit
    )
      return;
    setStale(false);
    void session.current?.submit(how);
  }

  function runExamples(how: "pointer" | "keyboard") {
    if (runner.current?.running || runtimeNow.current.state !== "ready") return;
    void session.current?.run("examples", how);
  }

  const mainRef = useRef<HTMLElement>(null);
  const challengePane = useRef<HTMLElement>(null);
  const resultsPane = useRef<HTMLElement>(null);
  const { layout, update: resize } = usePracticeLayout();
  const challengeBody = useRef<HTMLDivElement>(null);
  const resultsBody = useRef<HTMLDivElement>(null);
  const paneScroll = useRef({ challenge: 0, code: 0, feedback: 0 });
  function focusPane(pane: "challenge" | "code" | "feedback") {
    const bodies = {
      challenge: challengeBody.current,
      code: editorHost.current?.querySelector<HTMLElement>(".cm-content"),
      feedback: resultsBody.current,
    };
    const node = bodies[pane];
    if (!node) return;
    const mobile = window.matchMedia(STACKED).matches;
    const margin =
      (mainRef.current?.parentElement?.querySelector<HTMLElement>(
        ".practice-nav",
      )?.offsetHeight ?? 0) + 12;
    if (mobile) {
      for (const key of ["challenge", "code", "feedback"] as const) {
        const box = bodies[key]?.closest(".pane")?.getBoundingClientRect();
        if (box && box.top <= margin && box.bottom > margin)
          paneScroll.current[key] = Math.max(0, margin - box.top);
      }
    }
    // Keep the editor mounted and its cursor/internal scroll intact when moving away/back.
    node.focus({ preventScroll: true });
    if (mobile) {
      const box = node.closest(".pane")?.getBoundingClientRect();
      if (box)
        window.scrollTo({
          top: Math.max(
            0,
            window.scrollY + box.top - margin + paneScroll.current[pane],
          ),
          behavior: "instant",
        });
    }
  }
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
      if (!target || !target.closest(".practice") || target.closest("dialog"))
        return;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], .cm-editor",
        )
      )
        return;
      const pane = (
        { "1": "challenge", "2": "code", "3": "feedback" } as const
      )[event.key as "1" | "2" | "3"];
      if (!pane) return;
      event.preventDefault();
      focusPane(pane);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const progress = useProgress();
  const stars = useStars();
  const starred = stars.includes(challenge.key);
  const star = () => {
    writeStars(toggleStar(stars, challenge.key));
    void logStar(
      { key: challenge.key, revision: challenge.revision },
      !starred,
      {
        from: "practice",
      },
    );
  };
  const completedKeys = useMemo(
    () =>
      new Set(
        Object.entries(progress)
          .filter(([, p]) => p.completions > 0)
          .map(([key]) => key),
      ),
    [progress],
  );
  const currentProblem = candidates.find((i) => i.key === challenge.key);
  const next = currentProblem
    ? nextProblem(
        currentProblem,
        candidates,
        completedKeys,
        readProfileLanguages(),
      )
    : null;
  // The session's callbacks outlive renders; they read the latest suggestion through this.
  const nextRef = useRef(next);
  nextRef.current = next;
  const editorHost = useRef<HTMLDivElement>(null);
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(challenge.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<PracticeSession | null>(null);
  const types = useRef<TypeChecker | null>(null);
  const store = useRef<PracticeStore | null>(null);
  // Each mount (twice in development) bumps this; a superseded open installs nothing.
  const generation = useRef(0);
  function startRuntime() {
    if (!challenge.runnable || !engine) return;
    setCanSubmit(false);
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
  async function completed(current: PracticeSession, attemptId: string) {
    writeProgress(
      complete(
        readProgress(),
        challenge.key,
        attemptId,
        new Date().toISOString(),
      ),
    );
    if (session.current !== current) return;
    setAttempt({ id: attemptId, completed: true });
    if (!reflectionNow.current) saveReflection(reflectionFor(readProgress()));
    const reading = ++completionRead.current;
    try {
      await current.recorder.flush();
      const records = await store.current!.records();
      if (session.current === current && completionRead.current === reading)
        setShareRecords(records);
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
      // Starts the editor's language and keymap downloading while the store opens.
      void loadEditorModes(challenge.language as FileLanguage, keys).catch(
        () => {},
      );
      store.current ??= await openPracticeStore();
      const participantId = await store.current.participantId();
      const environment = await environmentOf();
      const records = await store.current.records();
      const host = editorHost.current;
      // A superseded open must not create a session or record anything.
      if (!host || !current()) return;
      const progress = readProgress();
      const localAttempt = progress[challenge.key];
      // Another tab may have changed progress after the continuation gate resolved.
      if (
        (!allowRepeat && (!localAttempt || localAttempt.completedAt)) ||
        (localAttempt?.revision &&
          localAttempt.revision !== challenge.revision &&
          !(localAttempt.completedAt && allowRepeat))
      )
        throw new Error(
          "The saved attempt changed. Reload to open its exact challenge version.",
        );
      const start = allowRepeat ? takeStart(challenge.key) : null;
      const now = new Date().toISOString();
      const chosen = attemptFor(
        progress,
        challenge.key,
        start !== null,
        now,
        randomAttempt,
        challenge.revision,
      );
      if (
        !chosen.fresh &&
        chosen.progress[challenge.key]?.revision &&
        chosen.progress[challenge.key].revision !== challenge.revision
      )
        throw new Error(
          "Reload to open the saved attempt's exact challenge version.",
        );
      if (chosen.fresh) writeProgress(chosen.progress);
      const attemptId = chosen.attempt;
      reflectionAttempt.current = attemptId;
      const done = chosen.progress[challenge.key]?.completedAt != null;
      setAttempt({ id: attemptId, completed: done });
      if (done) setShareRecords(records);
      const observed = attemptObservations(records, challenge.key, attemptId);
      const recovered = latestSavedCode(
        records,
        participantId,
        challenge.key,
        attemptId,
      );
      if (recovered)
        setMessage(
          [
            recoveryMessage(recovered),
            observed.some(
              (o) =>
                o.type === "practice.opened" &&
                o.challengeRevision !== challenge.revision,
            )
              ? "The challenge changed since your last visit. Your code was restored; review the requirements before submitting again."
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      const code = recovered?.files[revision.file] ?? revision.starter;
      savedScope.current = `${participantId}:${challenge.key}:${attemptId}`;
      const saved = readView(savedScope.current);
      const answered = observed.some((o) => o.type === "practice.answered");
      if (chosen.progress[challenge.key]?.reflection || done) {
        const selected = chosen.progress[challenge.key]?.reflection ?? {
          ...reflectionFor(progress),
          dismissed: true,
        };
        saveReflection(answered ? { ...selected, dismissed: true } : selected);
      }
      if (saved) {
        pendingPlace.current =
          saved.place && fitPlace(saved.place, code.length);
      }
      const opened: PracticeSession = new PracticeSession({
        participantId,
        termsVersion: account?.accepted?.version ?? "1970-01-01",
        challenge: {
          key: challenge.key,
          revision,
          revisionId: challenge.revision,
        },
        attemptId,
        started: chosen.fresh
          ? {
              from: start?.from ?? "direct",
              query: start?.query ?? null,
              position: start?.position ?? null,
            }
          : null,
        sink: store.current,
        code,
        restoredFrom: recovered?.revision,
        language: challenge.language,
        keymap: keys,
        types: types.current ?? undefined,
        runtime: challenge.runnable && engine ? engine.runtime : null,
        hasPreviousChecks: observed.some(
          (o) => o.type === "practice.submitted",
        ),
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onRunExamples: (how) => runExamples(how),
        suggestNext: () => nextRef.current?.key ?? null,
        onCompleted: () => void completed(opened, attemptId),
        onRun: (next) => {
          setRun(next);
          setCanSubmit(opened.canSubmit);
          if (next.status === "queued") {
            completionRead.current++;
            setShareRecords(null);
            if (resultsBody.current) resultsBody.current.scrollTop = 0;
          }
          setStale(next.revision !== session.current?.currentRevision);
          if (next.purpose === "submit" && next.verdict) setSubmission(next);
        },
        onEditedAfterRun: () => {
          setStale(true);
          setCanSubmit(false);
        },
        onSaveStatus: showSaveStatus,
        onVimMode: setVimMode,
        entry: entryPath(),
        profile: account?.profile ? ({ ...account.profile } as Json) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        environment,
      });
      session.current = opened;
      await opened.mount(host);
      if (!current()) return;
      opened.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setOpening({ state: "open" });
    } catch (cause) {
      console.warn("Practice could not open.", cause);
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
    if (checksTypes(challenge.language))
      types.current = new TypeChecker(revision.file);
    void open(() => attempt === generation.current);
    const saveView = () => persistView();
    window.addEventListener("pagehide", saveView);
    const timer = setInterval(() => {
      persistView();
      // Refreshed each second; state changes arrive at once through onSaveStatus.
      showSaveStatus(session.current?.saveStatus());
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
    () =>
      setChallengeContext({ key: challenge.key, revision: challenge.revision }),
    [challenge.key, challenge.revision],
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
    const place = pendingPlace.current;
    session.current?.restorePlace(place, Boolean(place));
    pendingPlace.current = null;
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || runtime.state === "none") return;
    session.current?.runtimeState(
      runtime.state,
      runtime.state === "unavailable" ? runtime.message : undefined,
    );
  }, [runtime.state, isOpen]);

  const running = run?.status === "queued" || run?.status === "running";
  const ready = runtime.state === "ready" && opening.state === "open";
  const publishedExamples = revision.cases.filter((c) => !c.hidden);
  const verdict = submission?.verdict ?? null;
  const done = !!attempt?.completed;
  const check = checkFeedbackOf({
    running: running && run?.purpose === "submit",
    completed: done && !running && !stale && (!verdict || verdict.complete),
    edited: stale && !!verdict,
    verdict,
    diagnosis: verdict
      ? diagnose(submission?.outcome ?? null, revision.cases)
      : null,
  });
  return (
    <div
      className={`practice tui${solveHere ? " solve-here" : ""}`}
      onClickCapture={persistView}
    >
      <DesktopFirst
        challenge={challenge}
        onSolveHere={() => {
          chooseSolveHere();
          requestAnimationFrame(() => focusPane("code"));
        }}
      />
      <nav className="practice-nav" aria-label="Practice panes">
        <button
          type="button"
          aria-controls="practice-challenge"
          onClick={() => focusPane("challenge")}
        >
          Challenge
        </button>
        <button
          type="button"
          aria-controls="practice-code"
          onClick={() => focusPane("code")}
        >
          Code
        </button>
        <button
          type="button"
          aria-controls="practice-feedback"
          onClick={() => focusPane("feedback")}
        >
          Feedback
        </button>
      </nav>
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
          id="practice-challenge"
          aria-label="Challenge"
          ref={challengePane}
        >
          <div className="pane-title">
            <kbd>[1]</kbd> challenge{" "}
            <span className="faint">· {challenge.key}</span>{" "}
            <button
              type="button"
              className="pane-star"
              aria-pressed={starred}
              title={starred ? "Unstar" : "Star"}
              onClick={star}
            >
              {starred ? "★" : "☆"}
            </button>
          </div>
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
            <h1>{challenge.title}</h1>
            <h2>Goal and requirements</h2>
            <Markdown source={challenge.task} />
            {revision.schema && (
              <details open>
                <summary>Data schema</summary>
                <pre>{revision.schema}</pre>
              </details>
            )}
            <ChallengeExamples examples={publishedExamples} compact />
            <CopyChallengeLink challengeKey={challenge.key} />
          </div>
        </section>
        <Splitter
          axis="x"
          label="Resize the challenge pane"
          controls="practice-challenge"
          value={() => challengePane.current?.offsetWidth ?? 0}
          min={CHALLENGE.min}
          max={() => (mainRef.current?.clientWidth ?? 0) - CODE_MIN.width}
          onChange={(width) => resize({ challenge: width })}
          onReset={() => resize({ challenge: null })}
        />
        <section
          className="pane practice-work"
          id="practice-code"
          aria-label="Your code"
        >
          <div className="pane-title">
            <kbd>[2]</kbd> code{" "}
            <span className="faint">
              · {languageLabel(challenge.language)} ·{" "}
              {keymap === "vim" ? `vim ${vimMode}` : "standard keys"}
            </span>
          </div>
          <div className="practice-editors">
            <div
              className="practice-editor"
              hidden={opening.state === "failed"}
              ref={editorHost}
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
                {saveLabel ?? "Opening…"}
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
              ) : (
                <>
                  <button
                    className="btn"
                    disabled={!ready}
                    aria-disabled={running && run?.purpose !== "examples"}
                    onClick={(event) => {
                      if (running) {
                        if (run?.purpose === "examples")
                          session.current?.cancel();
                        return;
                      }
                      void session.current?.run(
                        "examples",
                        event.detail === 0 ? "keyboard" : "pointer",
                      );
                    }}
                  >
                    {running && run?.purpose === "examples" ? (
                      "Cancel check"
                    ) : (
                      <>
                        Run examples <Shortcut />
                      </>
                    )}
                  </button>
                  <button
                    className={`btn${done ? "" : " primary"}`}
                    disabled={
                      !ready ||
                      (running && run?.purpose !== "submit") ||
                      (!running && !canSubmit)
                    }
                    title={
                      !canSubmit
                        ? "Pass examples for this code before submitting"
                        : undefined
                    }
                    aria-disabled={running && run?.purpose !== "submit"}
                    onClick={(event) => {
                      if (running) {
                        if (run?.purpose === "submit")
                          session.current?.cancel();
                        return;
                      }
                      submit(event.detail === 0 ? "keyboard" : "pointer");
                    }}
                  >
                    {running && run?.purpose === "submit"
                      ? "Cancel check"
                      : "Submit"}
                  </button>
                  {done &&
                    (next ? (
                      <Link
                        className="btn primary"
                        href={practiceHref(next.key)}
                        title={next.title}
                        onClick={() =>
                          noteStart({
                            key: next.key,
                            from: "next",
                            query: null,
                            position: null,
                          })
                        }
                      >
                        Next challenge →
                      </Link>
                    ) : (
                      <Link className="btn primary" href="/challenges">
                        Explore challenges
                      </Link>
                    ))}
                </>
              )}
            </div>
          }
        </section>
        <Splitter
          axis="y"
          label="Resize the feedback pane"
          controls="practice-feedback"
          value={() => resultsPane.current?.offsetHeight ?? 0}
          min={FEEDBACK.min}
          max={() => (mainRef.current?.clientHeight ?? 0) - CODE_MIN.height}
          onChange={(height) => resize({ feedback: height })}
          onReset={() => resize({ feedback: null })}
        />
        <section
          className="pane practice-results"
          id="practice-feedback"
          aria-label="Feedback"
          ref={resultsPane}
        >
          <div className="pane-title">
            <kbd>[3]</kbd> feedback
          </div>
          <div className="pane-body" tabIndex={0} ref={resultsBody}>
            <p className="t-sr" role="status" aria-atomic="true">
              {exampleAnnouncement(run, revision)}
            </p>
            {message && (
              <p className="practice-notice" role="status">
                {message}
              </p>
            )}
            {opening.state === "open" && (
              <div className="practice-feedback">
                {run?.purpose === "submit" && !run.verdict?.complete && (
                  <CheckFeedbackView feedback={check} />
                )}
                {!run && (
                  <p className="faint">Run examples to check your code.</p>
                )}
                {run && (
                  <section aria-label="Output">
                    <h2>
                      {stale ? "Last output · code edited since" : "Output"}
                    </h2>
                    <Output
                      run={run}
                      revision={revision}
                      runtime={engine?.label ?? challenge.language}
                    />
                  </section>
                )}
                {done &&
                  !stale &&
                  !running &&
                  run?.verdict?.complete &&
                  attempt &&
                  shareRecords && (
                    <CompletionModelComparisons
                      key={attempt.id}
                      records={shareRecords}
                      challenge={challenge.key}
                      revision={challenge.revision}
                      attempt={attempt.id}
                    />
                  )}
                {done && attempt && (
                  <section
                    className="practice-completion"
                    aria-label="After solving"
                  >
                    {shareRecords && (
                      <ShareOutcome
                        challenge={challenge}
                        attemptId={attempt.id}
                        records={shareRecords}
                        revision={revision}
                      />
                    )}
                    {reflection && (
                      <Reflection
                        state={reflection}
                        onDismiss={(answer) => {
                          saveReflection({ ...reflection, dismissed: true });
                          if (answer !== undefined)
                            session.current?.answered(
                              reflection.question,
                              answer,
                            );
                        }}
                      />
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <p className="tui-status">
        <span>
          <Shortcut /> runs examples · Esc, then Tab leaves the editor · 1 2 3
          switch panes ·{" "}
          <Link href="/settings/profile/editor">editor keys</Link>
          {(challenge.language === "javascript" ||
            challenge.language === "typescript") && (
            <>
              {" "}
              · F1 type info · F8 / Shift-F8 diagnostics ·{" "}
              <Shortcut shift keyName="M" /> diagnostics panel
            </>
          )}
        </span>
      </p>
      <TermFooter trail={trail} />
      <div ref={sandboxHost} hidden />
    </div>
  );
}

/** A brief announcement; detailed examples remain available in the feedback pane. */
function exampleAnnouncement(run: RunView | null, revision: Revision): string {
  if (run?.purpose !== "examples") return "";
  if (run.status === "queued" || run.status === "running")
    return "Running examples…";
  const outcome = run.outcome;
  if (!outcome) return "";
  if (outcome.status === "cancelled") return "Example check cancelled.";
  if (outcome.status === "timeout")
    return "Example check timed out. Look for a loop that never ends.";
  if (outcome.status === "runner-error")
    return "The test runner crashed; this wasn't your code.";
  if (outcome.error && outcome.phase !== "tests")
    return `Example check failed: ${outcome.error.type}: ${outcome.error.message}`;
  const feedback = runFeedback(
    casesRun(revision.cases, "examples"),
    outcome.cases,
  );
  return `Examples: ${feedback.correct} passed, ${feedback.total - feedback.correct} failed.`;
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
  revision,
  runtime,
}: {
  run: RunView | null;
  revision: Revision;
  runtime: string;
}) {
  const log = transcript(run, revision, runtime);
  if (!log.length)
    return (
      <p className="faint">
        Everything your last run printed, raised or returned shows here.
      </p>
    );
  return (
    <pre className="run-output">
      {log.map((line, index) => (
        <span key={index} className={`run-line ${line.tone}`}>
          {line.text}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function Shortcut({
  shift = false,
  keyName = "Enter",
}: {
  shift?: boolean;
  keyName?: string;
}) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <kbd>
      {mac ? "⌘" : "Ctrl+"}
      {shift ? (mac ? "⇧" : "Shift+") : ""}
      {keyName === "Enter" && mac ? "↵" : keyName}
    </kbd>
  );
}
