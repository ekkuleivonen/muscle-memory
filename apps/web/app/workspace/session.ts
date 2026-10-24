/**
 * One open workspace: editor transactions and runs become ordered raw observations, then
 * feedback is derived from the stored run outcome. No React state is touched per keystroke.
 */
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CaptureRecorder } from "../../../../packages/capture/recorder";
import type { CaptureSink } from "../../../../packages/capture/recorder";
import type { Challenge, Json } from "../../../../packages/domain/assessment";
import { contentArtifact } from "../../../../packages/domain/evidence";
import {
  codeRevision,
  EDIT_CHANGES_LIMIT_BYTES,
  toRecord,
  WORKSPACE_CAPTURE_GAPS,
  type RunStatus,
} from "../../../../packages/domain/workspace";
import {
  PythonRunner,
  RUNTIME,
  type RunOutcome,
} from "../../../../packages/runner/runner";
import { createEditor, EDITOR } from "./editor";

export const RUN_TIMEOUT_MS = 5000;
const SNAPSHOT_EVERY_EDITS = 25;

export interface RunView {
  readonly runId: string;
  readonly revision: number;
  readonly status: RunStatus;
  readonly outcome?: RunOutcome;
}

export interface SessionOptions {
  readonly participantId: string;
  readonly consentVersion: string;
  readonly challenge: Challenge & { entrypoint: string };
  readonly sink: CaptureSink;
  readonly initialCode: string;
  readonly restoredFrom?: number;
  /** The page's current runner; it changes when the runtime is reloaded. */
  readonly runner: () => PythonRunner;
  readonly onRun: (run: RunView) => void;
  /** Called on the first edit after a run, so its result can be shown as stale. */
  readonly onEditedAfterRun: () => void;
}

export class WorkspaceSession {
  readonly recorder: CaptureRecorder;
  readonly sourceId = `workspace-${crypto.randomUUID()}`;
  private view?: EditorView;
  private revision = 0;
  private editsSinceSnapshot = 0;
  private lastRun?: RunView;
  private staleNotified = true;

  constructor(private readonly options: SessionOptions) {
    const challengeArtifact = contentArtifact("challenge", options.challenge);
    this.recorder = new CaptureRecorder({
      participantId: options.participantId,
      sourceId: this.sourceId,
      consentVersion: options.consentVersion,
      challengeArtifactId: challengeArtifact.artifactId,
      sink: options.sink,
    });
    this.recorder.include(toRecord(challengeArtifact));
    const code = this.artifact(options.initialCode);
    this.recorder.observe(
      "observation.workspace.opened",
      {
        revision: 0,
        codeArtifactId: code.artifactId,
        editor: EDITOR,
        runtime: RUNTIME,
        captureGaps: WORKSPACE_CAPTURE_GAPS,
      },
      [code],
    );
    if (options.restoredFrom !== undefined)
      this.recorder.observe("observation.workspace.snapshot", {
        revision: 0,
        codeArtifactId: code.artifactId,
        reason: "restored",
      });
  }

  mount(parent: HTMLElement): void {
    this.view = createEditor(parent, this.options.initialCode, {
      onChange: (transaction) => this.recordEdit(transaction),
      onRun: () => void this.run(),
    });
    this.view.focus();
  }

  get currentRevision(): number {
    return this.revision;
  }

  get running(): boolean {
    return this.options.runner().running;
  }

  async run(): Promise<void> {
    if (!this.view || this.options.runner().running) return;
    const revision = this.revision;
    const code = this.artifact(this.view.state.doc.toString());
    const runId = crypto.randomUUID();
    const base = {
      runId,
      revision,
      codeArtifactId: code.artifactId,
      runtime: RUNTIME,
      timeoutMs: RUN_TIMEOUT_MS,
    };
    this.recorder.observe(
      "observation.workspace.snapshot",
      {
        revision,
        codeArtifactId: code.artifactId,
        reason: "run",
      },
      [code],
    );
    this.editsSinceSnapshot = 0;
    const update = (status: RunStatus, outcome?: RunOutcome) => {
      this.recorder.observe("observation.workspace.run", {
        ...base,
        status,
        ...(outcome ? { outcome: outcome as unknown as Json } : {}),
      });
      this.lastRun = { runId, revision, status, outcome };
      this.staleNotified = revision !== this.revision;
      this.options.onRun(this.lastRun);
    };
    update("queued");
    const outcome = await this.options.runner().run(
      {
        runId,
        code: this.view.state.doc.sliceString(0),
        functionName: this.options.challenge.entrypoint,
        inputs: this.options.challenge.inputs,
      },
      () => update("running"),
    );
    // The outcome belongs to `revision`, even if the editor has moved on since.
    update(statusOf(outcome), outcome);
  }

  cancel(): void {
    this.options.runner().cancel();
  }

  /** Stops capture after in-flight writes settle; the caller then clears storage. */
  async close(): Promise<void> {
    this.options.runner().cancel();
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
    this.recorder.observe("observation.workspace.edit", {
      revision: this.revision,
      changes: oversize ? null : changes,
      changesBytes,
      changesTruncated: oversize,
      userEvent: transaction.annotation(Transaction.userEvent) ?? null,
      selection: transaction.newSelection.toJSON() as Json,
      docLength: transaction.newDoc.length,
    });
    // Recovery snapshots let the document be rebuilt from the stream; an oversize edit
    // has no change set, so it is followed by a snapshot immediately.
    if (oversize || ++this.editsSinceSnapshot >= SNAPSHOT_EVERY_EDITS) {
      // This transaction's document, not the view's: one update can hold several
      // transactions, and the snapshot must match the revision it is labelled with.
      const code = this.artifact(transaction.newDoc.toString());
      this.recorder.observe(
        "observation.workspace.snapshot",
        {
          revision: this.revision,
          codeArtifactId: code.artifactId,
          reason: oversize ? "oversize-edit" : "periodic",
        },
        [code],
      );
      this.editsSinceSnapshot = 0;
    }
    if (this.lastRun && !this.staleNotified) {
      this.staleNotified = true;
      this.options.onEditedAfterRun();
    }
  }

  private artifact(code: string) {
    return codeRevision(
      this.options.participantId,
      this.sourceId,
      this.revision,
      code,
    );
  }
}

function statusOf(outcome: RunOutcome): RunStatus {
  if (outcome.status === "completed") return "result";
  return outcome.status;
}
