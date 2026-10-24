/**
 * One open workspace: editor transactions and runs become ordered raw observations, then
 * feedback is derived from the stored run outcome. No React state is touched per keystroke.
 */
import { randomId } from "../../../../packages/browser/random-id";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CaptureRecorder } from "../../../../packages/capture/recorder";
import type {
  CaptureSink,
  CaptureStatus,
} from "../../../../packages/capture/recorder";
import type { Challenge, Json } from "../../../../packages/domain/assessment";
import { contentArtifact } from "../../../../packages/domain/evidence";
import {
  codeRevision,
  type CodeRevisionArtifact,
  EDIT_CHANGES_LIMIT_BYTES,
  pullRequestResult,
  toRecord,
  type PullRequestResult,
  type RunPurpose,
  WORKSPACE_CAPTURE_GAPS,
  type RunStatus,
} from "../../../../packages/domain/workspace";
import {
  engineFor,
  type Engine,
  type Runner,
  type RunOutcome,
} from "../../../../packages/runner/runner";
import type { FileLanguage } from "../../lib/repo";
import { createEditor, editorFeatures, type Keymap } from "./editor";
import type { TypeChecker } from "./type-checker";

export const RUN_TIMEOUT_MS = 5000;
const SNAPSHOT_EVERY_EDITS = 25;

export interface RunView {
  readonly runId: string;
  readonly revision: number;
  readonly status: RunStatus;
  readonly outcome?: RunOutcome;
  readonly purpose: RunPurpose;
  /** For a pull request's checks: its number, and its result once they finish. */
  readonly pullRequest?: PullRequestView;
}

export interface PullRequestView {
  readonly number: number;
  /** 1 when opened, 2+ for pushes to it. */
  readonly push: number;
  readonly runId: string;
  readonly revision: number;
  readonly result?: PullRequestResult;
  readonly passed?: number;
  readonly total?: number;
  readonly at: string;
}

export interface SessionOptions {
  readonly participantId: string;
  readonly consentVersion: string;
  readonly challenge: Challenge & {
    entrypoint: string;
    parameters?: readonly string[];
    schema?: string;
    adapter?: string;
  };
  readonly sink: CaptureSink;
  readonly initialCode: string;
  readonly restoredFrom?: number;
  /** The solution file's language, keymap and media type; Python unless told otherwise. */
  readonly language?: FileLanguage;
  /** The solution's path in the repo, used in error locations. */
  readonly filename?: string;
  readonly keymap?: Keymap;
  readonly mediaType?: string;
  /** Type hints (squiggles, hover types) for languages that have them. */
  readonly types?: TypeChecker;
  /**
   * What runs the code, recorded with the session; by default the language's engine. Null
   * when this language cannot run yet: edits are still recorded, Run is not.
   */
  readonly runtime?: Engine["runtime"] | null;
  readonly onVimMode?: (mode: string) => void;
  /** Pull requests opened for this Challenge in earlier sessions, so numbers continue. */
  readonly pullRequestsBefore?: number;
  /**
   * The open pull request for this Challenge, if any, read when the person opens one: new work
   * is pushed to it instead of opening another.
   */
  readonly openPullRequest?: () => { number: number; pushes: number } | null;
  /** The page's current runner; it changes when the runtime is reloaded. */
  readonly runner: () => Runner;
  readonly onRun: (run: RunView) => void;
  /** Called on the first edit after a run, so its result can be shown as stale. */
  readonly onEditedAfterRun: () => void;
  /** Called only when the save status shown to the player may have changed. */
  readonly onSaveStatus?: (status: SaveStatus) => void;
}

/** Capture status plus whether the current code could be rebuilt exactly after a refresh. */
export interface SaveStatus extends CaptureStatus {
  readonly recoverable: boolean;
  readonly unrecoverableReason?: string;
}

export class WorkspaceSession {
  readonly recorder: CaptureRecorder;
  readonly sourceId = `workspace-${randomId()}`;
  private view?: EditorView;
  private revision = 0;
  private editsSinceSnapshot = 0;
  private lastRun?: RunView;
  private staleNotified = true;
  // Source position of the latest stored complete copy of the code, and of the latest
  // point after which the code could not be rebuilt from saved records.
  // Complete copies by source position; one is a safe point only if its artifact was
  // stored without conflict. Few per session (opening, every 25 edits, each Run).
  private readonly copies: { sequence: number; artifactId: string }[] = [];
  private unsafeAt = 0;
  private unsafeReason = "";
  private statusKey = "";
  private pullRequests = 0;

  private get runtime(): Engine["runtime"] | null {
    return this.options.runtime === undefined
      ? (engineFor(this.options.language ?? "python")?.runtime ?? null)
      : this.options.runtime;
  }

  constructor(private readonly options: SessionOptions) {
    this.pullRequests = options.pullRequestsBefore ?? 0;
    const challengeArtifact = contentArtifact("challenge", options.challenge);
    this.recorder = new CaptureRecorder({
      participantId: options.participantId,
      sourceId: this.sourceId,
      consentVersion: options.consentVersion,
      challengeArtifactId: challengeArtifact.artifactId,
      sink: options.sink,
      onTransition: () => this.notify(),
    });
    this.recorder.include(toRecord(challengeArtifact));
    const code = this.artifact(options.initialCode);
    this.markCopy(
      this.recorder.observe(
        "observation.workspace.opened",
        {
          revision: 0,
          codeArtifactId: code.artifactId,
          editor: editorFeatures(
            options.language ?? "python",
            options.keymap ?? "standard",
            Boolean(options.types),
          ),
          runtime: this.runtime,
          captureGaps: WORKSPACE_CAPTURE_GAPS,
        },
        [code],
      ),
      code,
    );
    if (options.restoredFrom !== undefined) this.snapshot(code, "restored");
  }

  /** What a refresh could bring back right now, with the capture status. */
  saveStatus(): SaveStatus {
    const status = this.recorder.status();
    const safeStart = this.safePoint();
    // Replay starts from the latest stored complete copy; anything lost or unreplayable
    // at or after it means a refresh cannot rebuild the current code exactly.
    const lost =
      status.lastLossSequence > 0 && status.lastLossSequence >= safeStart;
    const unsafe = this.unsafeAt > 0 && this.unsafeAt >= safeStart;
    return {
      ...status,
      recoverable: !lost && !unsafe,
      ...(lost
        ? {
            unrecoverableReason: status.artifactConflicts
              ? "a saved copy of your code conflicts with an existing record"
              : "some activity was not saved (capture gap)",
          }
        : unsafe
          ? { unrecoverableReason: this.unsafeReason }
          : {}),
    };
  }

  mount(parent: HTMLElement): void {
    this.view = createEditor(
      parent,
      this.options.initialCode,
      {
        onChange: (transaction) => this.recordEdit(transaction),
        onRun: () => void this.run(),
        onPullRequest: () => void this.pullRequest(),
        onVimMode: this.options.onVimMode,
      },
      {
        language: this.options.language ?? "python",
        keymap: this.options.keymap ?? "standard",
        label: "Code editor",
        types: this.options.types,
      },
    );
    this.view.focus();
  }

  get currentRevision(): number {
    return this.revision;
  }

  get running(): boolean {
    return this.options.runner().running;
  }

  /** Whether this language can run in the browser. */
  get runnable(): boolean {
    return this.runtime !== null;
  }

  /**
   * Opens a pull request, or pushes to the open one: this exact code, checked by a run of
   * every case.
   */
  pullRequest(): Promise<void> {
    return this.run("pull-request");
  }

  async run(purpose: RunPurpose = "local"): Promise<void> {
    if (!this.view || !this.runnable || this.options.runner().running) return;
    const revision = this.revision;
    const code = this.artifact(this.view.state.doc.toString());
    const runId = randomId();
    const base = {
      runId,
      purpose,
      revision,
      codeArtifactId: code.artifactId,
      runtime: this.runtime,
      timeoutMs: this.options.runner().timeoutMs ?? RUN_TIMEOUT_MS,
    };
    const open =
      purpose === "pull-request" ? this.options.openPullRequest?.() : null;
    if (open) this.pullRequests = Math.max(this.pullRequests, open.number);
    const pullRequest =
      purpose === "pull-request"
        ? {
            number: open ? open.number : ++this.pullRequests,
            push: open ? open.pushes + 1 : 1,
            runId,
            revision,
            at: new Date().toISOString(),
          }
        : undefined;
    this.snapshot(code, "run");
    this.editsSinceSnapshot = 0;
    const update = (status: RunStatus, outcome?: RunOutcome) => {
      this.recorder.observe("observation.workspace.run", {
        ...base,
        status,
        ...(outcome ? { outcome: outcome as unknown as Json } : {}),
      });
      this.lastRun = { runId, revision, status, outcome, purpose, pullRequest };
      this.staleNotified = revision !== this.revision;
      this.options.onRun(this.lastRun);
    };
    update("queued");
    const outcome = await this.options.runner().run(
      {
        runId,
        code: this.view.state.doc.sliceString(0),
        filename: this.options.filename ?? "solution.py",
        language: this.options.language ?? "python",
        entrypoint: this.options.challenge.entrypoint,
        ...(this.options.challenge.parameters
          ? { parameters: this.options.challenge.parameters }
          : {}),
        ...(this.options.challenge.schema
          ? { setup: this.options.challenge.schema }
          : {}),
        ...(this.options.challenge.adapter
          ? { adapter: this.options.challenge.adapter }
          : {}),
        inputs: this.options.challenge.inputs,
      },
      () => update("running"),
    );
    // The outcome belongs to `revision`, even if the editor has moved on since.
    if (pullRequest) {
      const verdict = pullRequestResult(this.options.challenge, outcome);
      Object.assign(pullRequest, verdict);
      this.recorder.observe("observation.workspace.pull-request", {
        number: pullRequest.number,
        push: pullRequest.push,
        runId,
        revision,
        codeArtifactId: code.artifactId,
        ...verdict,
      });
    }
    update(statusOf(outcome), outcome);
  }

  cancel(): void {
    this.options.runner().cancel();
  }

  /** Stops capture after in-flight writes settle; the caller then clears storage. */
  async close(): Promise<void> {
    // The IDE may already have dropped its runner when it unmounts.
    this.options.runner()?.cancel();
    this.view?.destroy();
    this.view = undefined;
    await this.recorder.stop();
  }

  /** Records one applied transaction. Exposed for tests; the editor calls it per change. */
  recordEdit(transaction: Transaction): void {
    this.revision++;
    const changes = transaction.changes.toJSON() as Json;
    const changesBytes = new TextEncoder().encode(
      JSON.stringify(changes),
    ).length;
    const oversize = changesBytes > EDIT_CHANGES_LIMIT_BYTES;
    const edit = this.recorder.observe("observation.workspace.edit", {
      revision: this.revision,
      changes: oversize ? null : changes,
      changesBytes,
      changesTruncated: oversize,
      userEvent: transaction.annotation(Transaction.userEvent) ?? null,
      selection: transaction.newSelection.toJSON() as Json,
      docLength: transaction.newDoc.length,
    });
    // Without a change set this edit cannot be replayed; only a complete copy made after
    // it (the snapshot below) makes the code recoverable again.
    if (oversize && edit)
      this.markUnsafe(
        edit.source.sequence,
        "a large edit could not be saved as a change",
      );
    // Recovery snapshots let the document be rebuilt from the stream; an oversize edit
    // has no change set, so it is followed by a snapshot immediately.
    if (oversize || ++this.editsSinceSnapshot >= SNAPSHOT_EVERY_EDITS) {
      // This transaction's document, not the view's: one update can hold several
      // transactions, and the snapshot must match the revision it is labelled with.
      const code = this.artifact(transaction.newDoc.toString());
      this.snapshot(code, oversize ? "oversize-edit" : "periodic");
      this.editsSinceSnapshot = 0;
    }
    this.notify();
    if (this.lastRun && !this.staleNotified) {
      this.staleNotified = true;
      this.options.onEditedAfterRun();
    }
  }

  private snapshot(
    code: CodeRevisionArtifact,
    reason: "restored" | "run" | "periodic" | "oversize-edit",
  ): void {
    this.markCopy(
      this.recorder.observe(
        "observation.workspace.snapshot",
        { revision: code.revision, codeArtifactId: code.artifactId, reason },
        [code],
      ),
      code,
    );
  }

  /** A stored complete copy is a safe point; a truncated one cannot restore the code. */
  private markCopy(
    observation: { source: { sequence: number } } | null,
    code: CodeRevisionArtifact,
  ): void {
    if (!observation) return; // Dropped: the recorder records the loss.
    const safeStart = this.safePoint();
    if (!code.capture.truncated)
      this.copies.push({
        sequence: observation.source.sequence,
        artifactId: code.artifactId,
      });
    // A truncated copy only matters when there is no exact replay to fall back on:
    // at opening, or right after an edit that had no change set.
    else if (safeStart === 0 || this.unsafeAt >= safeStart)
      this.markUnsafe(
        observation.source.sequence,
        "the code is larger than 64 KiB, too large to save a complete copy",
      );
    this.notify();
  }

  /**
   * The latest complete copy whose artifact is not known to conflict. A snapshot that only
   * references an already-conflicted artifact (for example a repeated Run at the same
   * revision) therefore never counts as a safe point.
   */
  private safePoint(): number {
    for (let index = this.copies.length - 1; index >= 0; index--)
      if (!this.recorder.artifactConflicted(this.copies[index].artifactId))
        return this.copies[index].sequence;
    return 0;
  }

  private markUnsafe(sequence: number, reason: string): void {
    this.unsafeAt = Math.max(this.unsafeAt, sequence);
    this.unsafeReason = reason;
  }

  private notify(): void {
    if (!this.options.onSaveStatus || !this.recorder) return;
    const status = this.saveStatus();
    const key = [
      status.buffered > 0,
      status.retrying,
      status.recoverable,
      status.unrecoverableReason,
      status.gaps,
    ].join();
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.options.onSaveStatus(status);
  }

  private artifact(code: string) {
    return codeRevision(
      this.options.participantId,
      this.sourceId,
      this.revision,
      code,
      this.options.mediaType,
    );
  }
}

function statusOf(outcome: RunOutcome): RunStatus {
  if (outcome.status === "completed") return "result";
  return outcome.status;
}
