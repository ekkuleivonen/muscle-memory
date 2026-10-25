/**
 * One open workspace: editor transactions and runs become ordered raw observations, then
 * feedback is derived from the stored run outcome. No React state is touched per keystroke.
 */
import { randomId } from "../../../../packages/browser/random-id";
import { Text, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CaptureRecorder } from "../../../../packages/capture/recorder";
import type {
  CaptureSink,
  CaptureStatus,
} from "../../../../packages/capture/recorder";
import { casesRun, type Executable } from "../../../../packages/content/model";
import type { Json } from "../../../../packages/domain/json";
import {
  codeRevision,
  type CodeRevisionArtifact,
  EDIT_CHANGES_LIMIT_BYTES,
  type KeyEvent,
  type ObservationData,
  type ObservationType,
  type ViewTarget,
  pullRequestResult,
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
import type { Release } from "../../lib/feedback";
import { fileViewOf, restoreFileView, type FileView } from "./continuity";
import type { FileLanguage } from "../../lib/repo";
import {
  createEditor,
  editorFeatures,
  type ActivityHooks,
  type Keymap,
} from "./editor";
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
  /** The issue and the revision worked against; recorded with every observation. */
  readonly issue: string;
  readonly issueRevision: string;
  /** What CI runs: the entry point and the revision's cases. */
  readonly executable: Executable;
  readonly sink: CaptureSink;
  /** Every editable file and the text it starts with (the revision's, or restored work). */
  readonly files: Readonly<Record<string, EditableFile>>;
  /** Source files the code may use but not change, by path; sent to CI with the edits. */
  readonly sources?: Readonly<Record<string, string>>;
  readonly restoredFrom?: number;
  /** The workspace's language, for the runtime and the editor features recorded; Python unless told otherwise. */
  readonly language?: FileLanguage;
  readonly keymap?: Keymap;
  /** Type hints (squiggles, hover types) for languages that have them. */
  readonly types?: TypeChecker;
  /**
   * What runs the code, recorded with the session; by default the language's engine. Null
   * when this language cannot run yet: edits are still recorded, Run is not.
   */
  readonly runtime?: Engine["runtime"] | null;
  readonly onVimMode?: (mode: string) => void;
  /** Pull requests opened for this issue in earlier sessions, so numbers continue. */
  readonly pullRequestsBefore?: number;
  /**
   * The open pull request for this issue, if any, read when the person opens one: new work
   * is pushed to it instead of opening another.
   */
  readonly openPullRequest?: () => { number: number; pushes: number } | null;
  /** The page's current runner; it changes when the runtime is reloaded. */
  readonly runner: () => Runner;
  readonly onRun: (run: RunView) => void;
  /** Practice maps both existing editor check shortcuts to its deliberate full Submit. */
  readonly onSubmit?: (via: "keyboard" | "pointer") => void;
  /** A prior PR's checks were restored; its first edit also invalidates the shown result. */
  readonly hasPreviousChecks?: boolean;
  /** Called once on the first edit after current or restored checks, to mark them stale. */
  readonly onEditedAfterRun: () => void;
  /** Called only when the save status shown to the player may have changed. */
  readonly onSaveStatus?: (status: SaveStatus) => void;
  /** The app page the IDE was opened from, and the window size, for `opened`. */
  readonly entry?: string | null;
  readonly viewport?: { width: number; height: number } | null;
  /** The self-reported profile when the IDE opened, for `opened`. */
  readonly profile?: Json | null;
}

/** Keys are written about once a second, or sooner when this many are waiting. */
const KEYS_EVERY_MS = 1000;
const KEYS_AT_MOST = 200;
/** Bursts of cursor moves and of scrolling merge into one observation within these windows. */
const SELECTION_MERGE_MS = 100;
const SCROLL_MERGE_MS = 250;

export interface EditableFile {
  readonly text: string;
  readonly language: FileLanguage;
  readonly mediaType: string;
}

/** Capture status plus whether the current code could be rebuilt exactly after a refresh. */
export interface SaveStatus extends CaptureStatus {
  readonly recoverable: boolean;
  readonly unrecoverableReason?: string;
}

export class WorkspaceSession {
  readonly recorder: CaptureRecorder;
  readonly sourceId = `workspace-${randomId()}`;
  /** Editors by path, mounted when their tab is first shown. */
  private readonly views = new Map<string, EditorView>();
  /** Every editable file's current text, kept per transaction so snapshots never lag. */
  private readonly docs = new Map<string, Text>();
  private readonly edited = new Set<string>();
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
  /** Key events waiting to be written, by file. */
  private readonly keys = new Map<string, KeyEvent[]>();
  private keysTimer: ReturnType<typeof setTimeout> | undefined;
  /** A burst being merged (selection or scroll in one file), written when it settles. */
  private burst:
    | { key: string; emit: () => void; timer: ReturnType<typeof setTimeout> }
    | undefined;
  private closed = false;

  private get runtime(): Engine["runtime"] | null {
    return this.options.runtime === undefined
      ? (engineFor(this.options.language ?? "python")?.runtime ?? null)
      : this.options.runtime;
  }

  constructor(private readonly options: SessionOptions) {
    this.pullRequests = options.pullRequestsBefore ?? 0;
    this.staleNotified = !options.hasPreviousChecks;
    this.recorder = new CaptureRecorder({
      participantId: options.participantId,
      sourceId: this.sourceId,
      consentVersion: options.consentVersion,
      issue: options.issue,
      issueRevision: options.issueRevision,
      sink: options.sink,
      onTransition: () => this.notify(),
    });
    for (const [path, file] of Object.entries(options.files))
      this.docs.set(path, Text.of(file.text.split(/\r\n?|\n/)));
    const code = this.artifact();
    this.markCopy(
      this.record(
        "observation.workspace.opened",
        {
          revision: 0,
          codeArtifactId: code.artifactId,
          entry: options.entry ?? null,
          profile: options.profile ?? null,
          viewport: options.viewport ?? null,
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

  /** Mounts the editor for one editable file; its edits are recorded under its path. */
  mount(path: string, parent: HTMLElement): void {
    const file = this.options.files[path];
    if (!file || this.views.has(path)) return;
    const view = createEditor(
      parent,
      this.docs.get(path)!.toString(),
      {
        onChange: (transaction) => this.recordEdit(path, transaction),
        onRun: () =>
          this.options.onSubmit
            ? this.options.onSubmit("keyboard")
            : void this.run("local", "keyboard"),
        onPullRequest: () =>
          this.options.onSubmit
            ? this.options.onSubmit("keyboard")
            : void this.pullRequest("keyboard"),
        onVimMode: this.options.onVimMode,
      },
      {
        language: file.language,
        keymap: this.options.keymap ?? "standard",
        label: `Code editor: ${path}`,
        // The type checker knows one file: the entry file.
        types:
          path === this.options.executable.entry
            ? this.options.types
            : undefined,
        activity: this.activity(path),
      },
    );
    this.views.set(path, view);
    view.focus();
  }

  private restoring = new Set<string>();
  private lastPlaces = new Map<string, FileView>();

  /** Each mounted editable file's cursor, selection and scroll, to come back to later. */
  places(): Record<string, FileView> {
    for (const [path, view] of this.views)
      if (view.dom.getClientRects().length)
        this.lastPlaces.set(path, fileViewOf(view));
    return Object.fromEntries(this.lastPlaces);
  }

  /**
   * Restores local view state without recording app-driven selection or scroll as activity.
   */
  restorePlace(
    path: string,
    place: FileView | undefined,
    focus: boolean,
  ): void {
    const view = this.views.get(path);
    if (!view || this.closed) return;
    if (place) {
      this.lastPlaces.set(path, place);
      this.restoring.add(path);
      restoreFileView(view, place);
      setTimeout(() => this.restoring.delete(path), 100);
    }
    if (focus) view.focus();
  }

  /** Editable files changed in this session. */
  editedFiles(): string[] {
    return [...this.edited];
  }

  /** The editable files' current text, by path. */
  code(): Record<string, string> {
    return Object.fromEntries(
      [...this.docs].map(([path, doc]) => [path, doc.toString()]),
    );
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
  pullRequest(via: "pointer" | "keyboard" = "pointer"): Promise<void> {
    return this.run("pull-request", via);
  }

  async run(
    purpose: RunPurpose = "local",
    via: "pointer" | "keyboard" = "pointer",
  ): Promise<void> {
    if (!this.views.size || !this.runnable || this.options.runner().running)
      return;
    const revision = this.revision;
    const code = this.artifact();
    // The program: the entry file CI loads, and every other source file it may import.
    const program = { ...this.options.sources, ...this.code() };
    const { entry } = this.options.executable;
    const runId = randomId();
    const base = {
      runId,
      via,
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
      this.record("observation.workspace.run", {
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
        code: program[entry] ?? "",
        filename: entry,
        files: Object.fromEntries(
          Object.entries(program).filter(([path]) => path !== entry),
        ),
        language: this.options.language ?? "python",
        entrypoint: this.options.executable.entrypoint,
        ...(this.options.executable.parameters
          ? { parameters: this.options.executable.parameters }
          : {}),
        ...(this.options.executable.schema
          ? { setup: this.options.executable.schema }
          : {}),
        ...(this.options.executable.adapter
          ? { adapter: this.options.executable.adapter }
          : {}),
        inputs: casesRun(this.options.executable.cases, purpose).map(
          (c) => c.input,
        ),
      },
      () => update("running"),
    );
    // The outcome belongs to `revision`, even if the editor has moved on since.
    if (pullRequest) {
      const verdict = pullRequestResult(this.options.executable.cases, outcome);
      Object.assign(pullRequest, verdict);
      this.record("observation.workspace.pull-request", {
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

  /** Records teammate feedback the revision's triggers released (see lib/feedback). */
  release(releases: readonly Release[]): void {
    for (const r of releases)
      if (r.kind === "comment")
        this.record("observation.workspace.comment", {
          comment: r.comment.id,
          where: r.comment.where,
          severity: r.comment.severity,
          wording: r.wording,
          ...(r.pullRequest
            ? { pullRequest: r.pullRequest, push: r.push }
            : {}),
        });
      else if (r.kind === "hint")
        this.record("observation.workspace.hint", {
          hint: r.hint.id,
          level: r.hint.level,
        });
      else
        this.record("observation.workspace.thread-resolved", {
          comment: r.comment,
          pullRequest: r.pullRequest,
          push: r.push,
          by: "code",
        });
  }

  /**
   * Records that the IDE was left, writes everything still buffered, then stops capture.
   * `discard` stops at once without writing, for when the caller is about to delete the data.
   */
  async close(discard = false): Promise<void> {
    // The IDE may already have dropped its runner when it unmounts.
    this.options.runner()?.cancel();
    if (!discard && !this.closed) {
      this.closed = true;
      this.settle();
      this.writeKeys();
      this.record("observation.workspace.closed", { reason: "left" });
      await this.recorder.flush().catch(() => undefined);
    }
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    await this.recorder.stop();
  }

  /**
   * The page is being hidden and may be unloaded: write what is buffered now. Best effort; the
   * browser may stop the page before the writes finish (a declared gap).
   */
  pageHidden(): void {
    if (this.closed) return;
    this.settle();
    this.writeKeys();
    this.record("observation.workspace.closed", {
      reason: "page-hidden-for-unload",
    });
    void this.recorder.flush().catch(() => undefined);
  }

  /** The page became visible or hidden, gained or lost focus, or was resized. */
  page(state: {
    visible: boolean;
    focused: boolean;
    width: number;
    height: number;
  }): void {
    this.record("observation.workspace.page", state);
  }

  /** A file, side bar view or panel opened, shown or closed. */
  navigated(
    target: ViewTarget,
    action: "open" | "show" | "close",
    value: string,
    via: "pointer" | "keyboard" | "app",
  ): void {
    this.record("observation.workspace.navigated", {
      target,
      action,
      value,
      via,
    });
  }

  runtimeState(
    state: "loading" | "ready" | "unavailable",
    message?: string,
  ): void {
    this.record("observation.workspace.runtime", {
      state,
      ...(message ? { message } : {}),
    });
  }

  /** What one file's editor reports besides its edits; read-only files too. */
  activity(file: string): ActivityHooks {
    return {
      onKey: (kind, key, modifiers, repeat) => {
        if (this.closed) return;
        const waiting = this.keys.get(file) ?? [];
        waiting.push([this.recorder.elapsed(), kind, key, modifiers, repeat]);
        this.keys.set(file, waiting);
        if (waiting.length >= KEYS_AT_MOST) this.writeKeys();
        else
          this.keysTimer ??= setTimeout(() => this.writeKeys(), KEYS_EVERY_MS);
      },
      onSelection: (selection, userEvent) => {
        if (this.restoring.has(file)) return;
        const key = `selection:${file}`;
        const moves =
          this.burst?.key === key ? (this.merging as number) + 1 : 1;
        this.merge(key, SELECTION_MERGE_MS, moves, () =>
          this.record("observation.workspace.selection", {
            file,
            selection: selection as Json,
            userEvent,
            moves,
          }),
        );
      },
      onScroll: (fromLine, toLine) =>
        !this.restoring.has(file) &&
        this.merge(`scroll:${file}`, SCROLL_MERGE_MS, 0, () =>
          this.record("observation.workspace.scroll", {
            file,
            fromLine,
            toLine,
          }),
        ),
      onFocus: (focused) =>
        this.record("observation.workspace.focus", { file, focused }),
      onClipboard: (kind, ranges, wholeLines) =>
        this.record("observation.workspace.clipboard", {
          file,
          kind,
          ranges,
          wholeLines,
        }),
      onAssist: (kind, items) =>
        this.record("observation.workspace.assist", {
          file,
          kind,
          items: items as Json,
        }),
    };
  }

  /** Moves merged so far in the current selection burst. */
  private merging = 0;

  /** Holds the latest of a burst until it settles; a different burst settles this one first. */
  private merge(
    key: string,
    ms: number,
    count: number,
    emit: () => void,
  ): void {
    if (this.closed) return;
    if (this.burst && this.burst.key !== key) this.settle();
    if (this.burst) clearTimeout(this.burst.timer);
    this.merging = count;
    this.burst = { key, emit, timer: setTimeout(() => this.settle(), ms) };
  }

  /** Writes the burst being merged, if any. */
  private settle(): void {
    const burst = this.burst;
    if (!burst) return;
    clearTimeout(burst.timer);
    this.burst = undefined;
    this.merging = 0;
    burst.emit();
  }

  /** Writes waiting key events, one observation per file. */
  private writeKeys(): void {
    clearTimeout(this.keysTimer);
    this.keysTimer = undefined;
    for (const [file, keys] of this.keys)
      if (keys.length)
        this.recorder.observe("observation.workspace.keys", { file, keys });
    this.keys.clear();
  }

  /**
   * Every observation but keys goes through here, so a merged burst is written before what
   * follows it and source order matches what happened. Keys carry their own times instead.
   */
  private record<T extends ObservationType>(
    type: T,
    data: ObservationData[T],
    artifacts?: readonly CodeRevisionArtifact[],
  ) {
    this.settle();
    return this.recorder.observe(type, data, artifacts);
  }

  /** Records one applied transaction in one file. Exposed for tests; the editor calls it per change. */
  recordEdit(file: string, transaction: Transaction): void {
    this.revision++;
    this.docs.set(file, transaction.newDoc);
    this.edited.add(file);
    const changes = transaction.changes.toJSON() as Json;
    const changesBytes = new TextEncoder().encode(
      JSON.stringify(changes),
    ).length;
    const oversize = changesBytes > EDIT_CHANGES_LIMIT_BYTES;
    const edit = this.record("observation.workspace.edit", {
      file,
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
      // This transaction's documents, not the views': one update can hold several
      // transactions, and the snapshot must match the revision it is labelled with.
      const code = this.artifact();
      this.snapshot(code, oversize ? "oversize-edit" : "periodic");
      this.editsSinceSnapshot = 0;
    }
    this.notify();
    if (!this.staleNotified) {
      this.staleNotified = true;
      this.options.onEditedAfterRun();
    }
  }

  private snapshot(
    code: CodeRevisionArtifact,
    reason: "restored" | "run" | "periodic" | "oversize-edit",
  ): void {
    this.markCopy(
      this.record(
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
    if (!code.truncated)
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

  private artifact() {
    return codeRevision(
      this.options.participantId,
      this.sourceId,
      this.revision,
      Object.fromEntries(
        [...this.docs].map(([path, doc]) => [
          path,
          {
            text: doc.toString(),
            mediaType: this.options.files[path].mediaType,
          },
        ]),
      ),
    );
  }
}

function statusOf(outcome: RunOutcome): RunStatus {
  if (outcome.status === "completed") return "result";
  return outcome.status;
}
