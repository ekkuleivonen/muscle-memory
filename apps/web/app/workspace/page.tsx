"use client";
import { useEffect, useRef, useState } from "react";
import catalogData from "../../../../content/catalog/reference.v1.json";
import type { Catalog } from "../../../../packages/catalog/catalog";
import { findEntry } from "../../../../packages/catalog/gates";
import type { Challenge } from "../../../../packages/domain/assessment";
import { runFeedback } from "../../../../packages/domain/workspace";
import { MemorySink } from "../../../../packages/capture/recorder";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../packages/browser/practice-store";
import { PythonRunner, RUNTIME } from "../../../../packages/runner/runner";
import { currentCatalog } from "../current-catalog";
import {
  latestSavedCode,
  type RecoveredCode,
} from "../../../../packages/capture/restore";
import { contentArtifactId } from "../../../../packages/domain/evidence";
import { recoveryMessage, saveState } from "./save-state";
import {
  RUN_TIMEOUT_MS,
  WorkspaceSession,
  type RunView,
  type SaveStatus,
} from "./session";

type Executable = Challenge & { entrypoint: string; starter: string };
const REF = {
  kind: "challenge",
  id: "frequency-map",
  version: "2.0.0",
} as const;
const challenge = findEntry(catalogData as unknown as Catalog, REF)!
  .content as Executable;

type Runtime =
  | { state: "loading" }
  | { state: "ready" }
  | { state: "unavailable"; message: string };

export default function Workspace() {
  const [saveOnDevice, setSaveOnDevice] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [runtime, setRuntime] = useState<Runtime>({ state: "loading" });
  const [run, setRun] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  const [capture, setCapture] = useState<SaveStatus | null>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const sandboxHost = useRef<HTMLDivElement>(null);
  const runner = useRef<PythonRunner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const store = useRef<PracticeStore | null>(null);
  const memory = useRef(new MemorySink());
  // Synchronous guard plus generation: only the latest, uncancelled open may install a
  // session, however its catalog and storage responses interleave.
  const openInFlight = useRef(false);
  const generation = useRef(0);

  function startRuntime() {
    runner.current?.dispose();
    const next = new PythonRunner(sandboxHost.current!, {
      timeoutMs: RUN_TIMEOUT_MS,
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

  useEffect(() => {
    startRuntime();
    return () => {
      generation.current++;
      runner.current?.dispose();
      void session.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(
      // Counts refresh each second; state changes arrive at once through onSaveStatus.
      () => setCapture(session.current?.saveStatus() ?? null),
      1000,
    );
    return () => clearInterval(timer);
  }, [open]);

  async function begin() {
    if (openInFlight.current || session.current) return;
    openInFlight.current = true;
    const attempt = ++generation.current;
    const current = () => attempt === generation.current;
    setOpening(true);
    setError("");
    try {
      const catalog = await currentCatalog();
      if (findEntry(catalog, REF)?.state !== "published")
        throw new Error("This Challenge is not available right now.");
      let participantId = "local-session";
      let initialCode = challenge.starter;
      let restoredFrom: number | undefined;
      let recovered: RecoveredCode | null = null;
      if (saveOnDevice) {
        store.current ??= await openPracticeStore();
        participantId = await store.current.participantId();
        recovered = latestSavedCode(
          await store.current.workspaceRecords(),
          participantId,
          contentArtifactId("challenge", challenge.id, challenge.version),
        );
        if (recovered) {
          initialCode = recovered.text;
          restoredFrom = recovered.revision;
        }
      }
      // A cleared or superseded open must not create a session or record anything.
      if (!current()) return;
      if (recovered) setMessage(recoveryMessage(recovered));
      session.current = new WorkspaceSession({
        participantId,
        consentVersion: saveOnDevice
          ? "workspace-device-local-v1"
          : "workspace-session-v1",
        challenge,
        sink: saveOnDevice ? store.current! : memory.current,
        initialCode,
        restoredFrom,
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onRun: (view) => {
          setRun(view);
          setStale(view.revision !== session.current?.currentRevision);
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
      });
      setOpen(true);
    } catch (cause) {
      if (current())
        setError(
          cause instanceof Error
            ? cause.message
            : "The workspace could not open.",
        );
    } finally {
      if (current()) {
        openInFlight.current = false;
        setOpening(false);
      }
    }
  }

  useEffect(() => {
    if (open && editorHost.current && session.current)
      session.current.mount(editorHost.current);
  }, [open]);

  async function clearActivity() {
    setError("");
    // Cancels any open still in flight.
    generation.current++;
    openInFlight.current = false;
    setOpening(false);
    try {
      await session.current?.close();
      session.current = null;
      memory.current.clear();
      if (saveOnDevice) {
        store.current ??= await openPracticeStore();
        await store.current.clear();
      }
      setOpen(false);
      setRun(null);
      setCapture(null);
      setUnderstood(false);
      setMessage(
        "Workspace activity, pending captures and local identity cleared. Downloaded copies must be removed separately.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Activity could not be cleared.",
      );
    }
  }

  const feedback =
    run?.outcome && "cases" in run.outcome
      ? runFeedback(challenge, run.outcome.cases)
      : null;
  return (
    <main className="workspace">
      <header>
        <a href="/" className="brand">
          muscle memory<span>KEEP YOUR CRAFT</span>
        </a>
        <span className="note">
          Python {RUNTIME.python} · Pyodide {RUNTIME.version} · runs in your
          browser
        </span>
      </header>
      <section className="adventure">
        <div className="chapter">
          WORKSPACE PREVIEW{" "}
          <span>
            PYTHON · {challenge.id}@{challenge.version}
          </span>
        </div>
        <h2>Frequency map</h2>
        <p>{challenge.task}</p>
        {!open ? (
          <div>
            <p className="note">
              While the workspace is open it records your edits inside the
              editor (including text you paste into it), code revisions, runs
              and their output. It does not watch your keyboard or clipboard
              outside the editor, and nothing is uploaded. By default records
              stay in this tab&apos;s memory and disappear when you close it.
              Research sharing is off.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={saveOnDevice}
                onChange={(event) => setSaveOnDevice(event.target.checked)}
              />{" "}
              Save workspace activity and code on this device (optional).
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={understood}
                onChange={(event) => setUnderstood(event.target.checked)}
              />{" "}
              I understand what is recorded and want to practice locally.
            </label>
            <button disabled={!understood || opening} onClick={begin}>
              {opening ? "Opening…" : "Open the workspace →"}
            </button>
          </div>
        ) : (
          <div>
            <div ref={editorHost} className="editor" />
            <div className="toolbar">
              {session.current?.running ||
              run?.status === "queued" ||
              run?.status === "running" ? (
                <button
                  className="secondary"
                  onClick={() => session.current?.cancel()}
                >
                  Cancel run
                </button>
              ) : (
                <button
                  disabled={runtime.state !== "ready"}
                  onClick={() => void session.current?.run()}
                >
                  Run ▸ <span className="note">(Ctrl/⌘-Enter)</span>
                </button>
              )}
              <span role="status" className="note">
                {runtime.state === "loading" && "Loading Python…"}
                {runtime.state === "ready" && "Python ready."}
              </span>
            </div>
            {runtime.state === "unavailable" && (
              <p role="alert" className="error">
                Run is unavailable: {runtime.message}{" "}
                <button className="secondary" onClick={startRuntime}>
                  Retry loading Python
                </button>
              </p>
            )}
            {run && (
              <section aria-live="polite" className="result">
                <h3>
                  Run {run.status}
                  {stale &&
                    ` · for revision ${run.revision}; you have edited since`}
                </h3>
                {run.outcome?.status === "timeout" && (
                  <p>
                    Stopped after {run.outcome.timeoutMs / 1000} s. Check for a
                    loop that never ends.
                  </p>
                )}
                {run.outcome?.status === "cancelled" && (
                  <p>Run cancelled. Your code is unchanged.</p>
                )}
                {run.outcome?.status === "runner-error" && (
                  <p>
                    The Python runtime failed ({run.outcome.phase}), not your
                    code: {run.outcome.message}
                  </p>
                )}
                {run.outcome && "error" in run.outcome && run.outcome.error && (
                  <pre>
                    {run.outcome.error.traceback.text ||
                      `${run.outcome.error.type}: ${run.outcome.error.message}`}
                  </pre>
                )}
                {feedback &&
                  run.outcome &&
                  "cases" in run.outcome &&
                  run.outcome.phase === "tests" && (
                    <>
                      <p>
                        {feedback.correct}/{feedback.total} fixtures correct.
                        Practice feedback, not a skill ranking.
                      </p>
                      <ol>
                        {challenge.inputs.map((input, index) => {
                          const result =
                            run.outcome && "cases" in run.outcome
                              ? run.outcome.cases[index]
                              : undefined;
                          return (
                            <li key={index}>
                              <code>{JSON.stringify(input)}</code> →{" "}
                              {feedback.passed[index] ? "correct" : "not yet"}
                              {result?.error ? (
                                <pre>{result.error.traceback.text}</pre>
                              ) : (
                                <span className="note">
                                  {" "}
                                  returned {result?.repr?.text ?? "nothing"}
                                  {result?.unserializable &&
                                    ` (not JSON: ${result.unserializable})`}
                                  {result?.conversionError && (
                                    <pre>
                                      {result.conversionError.traceback.text ||
                                        `${result.conversionError.type}: ${result.conversionError.message}`}
                                    </pre>
                                  )}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}
                {run.outcome &&
                  "stdout" in run.outcome &&
                  (run.outcome.stdout.bytes > 0 ||
                    run.outcome.stderr.bytes > 0) && (
                    <>
                      <h4>Output</h4>
                      <pre>
                        {run.outcome.stdout.text + run.outcome.stderr.text}
                      </pre>
                      {(run.outcome.stdout.truncated ||
                        run.outcome.stderr.truncated) && (
                        <p className="note">
                          Output truncated: showing the first 64 KiB of{" "}
                          {run.outcome.stdout.bytes + run.outcome.stderr.bytes}{" "}
                          bytes.
                        </p>
                      )}
                    </>
                  )}
              </section>
            )}
            <p className="note" role="status">
              {capture && saveState(capture, saveOnDevice)}
            </p>
            <button className="secondary" onClick={clearActivity}>
              {saveOnDevice
                ? "Clear all device-local practice, workspace activity and identity"
                : "Clear workspace activity"}
            </button>
          </div>
        )}
      </section>
      <div ref={sandboxHost} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
    </main>
  );
}
