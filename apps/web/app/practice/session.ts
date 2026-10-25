/**
 * One practice session on a challenge: editor transactions, runs and submissions become ordered
 * raw observations (the practice stream), and feedback is derived from the stored run outcome.
 * No React state is touched per keystroke.
 */
import { randomId } from "../../../../packages/browser/random-id";
import { Text, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { CaptureRecorder } from "../../../../packages/capture/recorder";
import type {
  CaptureSink,
  CaptureStatus,
} from "../../../../packages/capture/recorder";
import { PAGE_SESSION_ID } from "../../../../packages/browser/page-session";
import { boundText } from "../../../../packages/domain/capture";
import {
  casesRun,
  type Revision,
} from "../../../../packages/content/model";
import type { Json } from "../../../../packages/domain/json";
import {
  EDIT_CHANGES_LIMIT_BYTES,
  AFTER_QUESTIONS,
  PRACTICE_CAPTURE_GAPS,
  type AfterQuestion,
  PRACTICE_CAPTURE_VERSION,
  type Environment,
  type KeyEvent,
  type PracticeData,
  type PracticeType,
  type RunPurpose,
  type RunStatus,
} from "../../../../packages/domain/practice";
import { codeRevision, type CodeRevisionArtifact } from "../../../../packages/domain/records";
import { verdictOf, type Verdict } from "../../lib/submission";
import {
  engineFor,
  type Engine,
  type Runner,
  type RunOutcome,
} from "../../../../packages/runner/runner";
import { placeOf, restorePlace, type Place } from "./continuity";
import { mediaTypeOf, type FileLanguage, type LanguageId } from "../../lib/languages";
import {
  createEditor,
  editorFeatures,
  loadEditorModes,
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
  /** For a Submit, once its run finished: cases and rules, and whether it completed. */
  readonly verdict?: Verdict;
}

export interface SessionOptions {
  readonly participantId: string;
  /** The accepted Terms version, such as 2026-10-25.1. */
  readonly termsVersion: string;
  /** The challenge and the revision worked against; recorded with every observation. */
  readonly challenge: { readonly key: string; readonly revision: Revision; readonly revisionId: string };
  /** The attempt this session belongs to. */
  readonly attemptId: string;
  /** Set when this session begins the attempt: recorded as `started`, before `opened`. */
  readonly started?: PracticeData["practice.started"] | null;
  readonly sink: CaptureSink;
  /** The code the editor opens with: the starter, or restored work. */
  readonly code: string;
  readonly restoredFrom?: number;
  /** The challenge's language, for the runtime, the editor and the features recorded; Python unless told otherwise. */
  readonly language?: LanguageId;
  readonly keymap?: Keymap;
  /** Type hints (squiggles, hover types) for languages that have them. */
  readonly types?: TypeChecker;
  /**
   * What runs the code, recorded with the session; by default the language's engine. Null
   * when this language cannot run yet: edits are still recorded, Run is not.
   */
  readonly runtime?: Engine["runtime"] | null;
  readonly onVimMode?: (mode: string) => void;
  /** The challenge suggested next, by key, recorded with a completion. */
  readonly suggestNext?: () => string | null;
  /** A Submit completed the attempt; its `completed` is recorded. */
  readonly onCompleted?: (run: RunView) => void;
  /** The page's current runner; it changes when the runtime is reloaded. */
  readonly runner: () => Runner;
  readonly onRun: (run: RunView) => void;
  /** Mod-Enter in the editor: the page decides whether Submit can run now. */
  readonly onSubmit?: (via: "keyboard" | "pointer") => void;
  /** A prior submission's feedback is shown; its first edit also marks it out of date. */
  readonly hasPreviousChecks?: boolean;
  /** Called once on the first edit after current or restored checks, to mark them stale. */
  readonly onEditedAfterRun: () => void;
  /** Called only when the save status shown to the player may have changed. */
  readonly onSaveStatus?: (status: SaveStatus) => void;
  /** The app page practice was opened from, and the window size, for `opened`. */
  readonly entry?: string | null;
  readonly viewport?: { width: number; height: number } | null;
  readonly environment?: Environment | null;
  /** The self-reported profile when practice opened, for `opened`. */
  readonly profile?: Json | null;
}

/** Keys are written about once a second, or sooner when this many are waiting. */
const KEYS_EVERY_MS = 1000;
const KEYS_AT_MOST = 200;
/** Bursts of cursor moves and of scrolling merge into one observation within these windows. */
const SELECTION_MERGE_MS = 100;
const SCROLL_MERGE_MS = 250;

/** Capture status plus whether the current code could be rebuilt exactly after a refresh. */
export interface SaveStatus extends CaptureStatus {
  readonly recoverable: boolean;
  readonly unrecoverableReason?: string;
}

export class PracticeSession {
  readonly recorder: CaptureRecorder;
  readonly sourceId = `practice-${randomId()}`;
  private view?: EditorView;
  /** The code now, kept per transaction so snapshots never lag. */
  private doc: Text;
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
  /** Key events waiting to be written. */
  private keys: KeyEvent[] = [];
  private keysTimer: ReturnType<typeof setTimeout> | undefined;
  /** A burst being merged (selection or scroll), written when it settles. */
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
    this.staleNotified = !options.hasPreviousChecks;
    this.recorder = new CaptureRecorder({
      participantId: options.participantId,
      sessionId: PAGE_SESSION_ID,
      sourceId: this.sourceId,
      termsVersion: options.termsVersion,
      challenge: { key: options.challenge.key, revision: options.challenge.revisionId },
      attemptId: options.attemptId,
      sink: options.sink,
      onTransition: () => this.notify(),
    });
    this.doc = Text.of(options.code.split(/\r\n?|\n/));
    if (options.started) this.record("practice.started", options.started);
    const code = this.artifact();
    this.markCopy(
      this.record(
        "practice.opened",
        {
          revision: 0,
          codeArtifactId: code.artifactId,
          entry: options.entry ?? null,
          profile: options.profile ?? null,
          viewport: options.viewport ?? null,
          environment: options.environment ?? null,
          editor: editorFeatures(
            options.language ?? "python",
            options.keymap ?? "standard",
            Boolean(options.types),
          ),
          runtime: this.runtime,
          captureGaps: PRACTICE_CAPTURE_GAPS,
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

  /** The challenge's file name, which observations and code copies name. */
  private get file(): string {
    return this.options.challenge.revision.file;
  }

  /** Mounts the editor once its language and keymap have loaded; edits are recorded as they happen. */
  async mount(parent: HTMLElement): Promise<void> {
    const language = (this.options.language ?? "python") as FileLanguage;
    const keys = this.options.keymap ?? "standard";
    const modes = await loadEditorModes(language, keys);
    if (this.view || this.closed) return;
    this.view = createEditor(
      parent,
      this.doc.toString(),
      {
        onChange: (transaction) => this.recordEdit(transaction),
        onSubmit: () =>
          this.options.onSubmit
            ? this.options.onSubmit("keyboard")
            : void this.submit("keyboard"),
        onVimMode: this.options.onVimMode,
      },
      {
        language,
        label: `Code editor: ${this.file}`,
        modes,
        types: this.options.types,
        activity: this.activity(),
      },
    );
    focusInPlace(this.view);
  }

  private restoring = false;
  private lastPlace: Place | null = null;

  /** The cursor, selection and scroll, to come back to later. */
  place(): Place | null {
    if (this.view?.dom.getClientRects().length) this.lastPlace = placeOf(this.view);
    return this.lastPlace;
  }

  /** Restores the view without recording app-driven selection or scroll as activity. */
  restorePlace(place: Place | null, focus: boolean): void {
    const view = this.view;
    if (!view || this.closed) return;
    if (place) {
      this.lastPlace = place;
      this.restoring = true;
      restorePlace(view, place);
      setTimeout(() => (this.restoring = false), 100);
    }
    if (focus) focusInPlace(view);
  }

  /** The code now. */
  code(): string {
    return this.doc.toString();
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
   * Submits this exact code: a run of every case, then the verdict (cases and rules) and, when
   * it holds, completion.
   */
  submit(via: "pointer" | "keyboard" = "pointer"): Promise<void> {
    return this.run("submit", via);
  }

  /** The challenge's text was copied: what, bounded. It is the challenge's own text. */
  copiedChallenge(text: string): void {
    if (this.closed || !text) return;
    const cut = boundText(text, 4096);
    this.record("practice.clipboard", {
      source: "challenge",
      kind: "copy",
      text: cut.text,
      textBytes: cut.originalBytes,
      truncated: cut.truncated,
    });
  }

  /** An answer to a question asked after completing; unknown answers are not recorded. */
  answered(question: AfterQuestion, answer: string): void {
    if (this.closed || !(AFTER_QUESTIONS[question] as readonly string[])?.includes(answer)) return;
    this.record("practice.answered", { question, answer });
  }

  async run(
    purpose: RunPurpose = "examples",
    via: "pointer" | "keyboard" = "pointer",
  ): Promise<void> {
    if (!this.view || !this.runnable || this.options.runner().running)
      return;
    const revision = this.revision;
    const code = this.artifact();
    const challenge = this.options.challenge.revision;
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
    const text = this.code();
    this.snapshot(code, "run");
    this.editsSinceSnapshot = 0;
    const update = (status: RunStatus, outcome?: RunOutcome, verdict?: Verdict) => {
      this.record("practice.run", {
        ...base,
        status,
        ...(outcome ? { outcome: outcome as unknown as Json } : {}),
      });
      this.lastRun = { runId, revision, status, outcome, purpose, ...(verdict ? { verdict } : {}) };
      this.staleNotified = revision !== this.revision;
      this.options.onRun(this.lastRun);
    };
    update("queued");
    const outcome = await this.options.runner().run(
      {
        runId,
        code: text,
        filename: challenge.file,
        language: this.options.language ?? "python",
        entrypoint: challenge.entrypoint,
        ...(challenge.parameters ? { parameters: challenge.parameters } : {}),
        ...(challenge.schema ? { setup: challenge.schema } : {}),
        ...(challenge.adapter ? { adapter: challenge.adapter } : {}),
        inputs: casesRun(challenge.cases, purpose).map(
          (c) => c.input,
        ),
      },
      () => update("running"),
    );
    // The outcome belongs to `revision`, even if the editor has moved on since.
    if (purpose !== "submit") return update(statusOf(outcome), outcome);
    const verdict = verdictOf(challenge, outcome, text);
    this.record("practice.submitted", {
      runId,
      revision,
      codeArtifactId: code.artifactId,
      result: verdict.result,
      passed: verdict.passed,
      total: verdict.total,
      rules: verdict.rules.map((rule) => rule.id),
    });
    if (verdict.complete)
      this.record("practice.completed", {
        runId,
        codeArtifactId: code.artifactId,
        suggested: this.options.suggestNext?.() ?? null,
      });
    update(statusOf(outcome), outcome, verdict);
    if (verdict.complete) this.options.onCompleted?.(this.lastRun!);
    return;

  }

  cancel(): void {
    this.options.runner().cancel();
  }

  /**
   * Records that practice was left, writes everything still buffered, then stops capture.
   * `discard` stops at once without writing, for when the caller is about to delete the data.
   */
  async close(discard = false): Promise<void> {
    // Practice may already have dropped its runner when it unmounts.
    this.options.runner()?.cancel();
    if (!discard && !this.closed) {
      this.closed = true;
      this.settle();
      this.writeKeys();
      this.record("practice.closed", { reason: "left" });
      await this.recorder.flush().catch(() => undefined);
    }
    this.view?.destroy();
    this.view = undefined;
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
    this.record("practice.closed", {
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
    this.record("practice.page", state);
  }

  runtimeState(
    state: "loading" | "ready" | "unavailable",
    message?: string,
  ): void {
    this.record("practice.runtime", {
      state,
      ...(message ? { message } : {}),
    });
  }

  /** What the editor reports besides its edits. */
  activity(): ActivityHooks {
    const file = this.file;
    return {
      onKey: (kind, key, code, modifiers, repeat) => {
        if (this.closed) return;
        this.keys.push([this.recorder.elapsed(), kind, key, code, modifiers, repeat]);
        if (this.keys.length >= KEYS_AT_MOST) this.writeKeys();
        else
          this.keysTimer ??= setTimeout(() => this.writeKeys(), KEYS_EVERY_MS);
      },
      onSelection: (selection, userEvent) => {
        if (this.restoring) return;
        const key = "selection";
        const moves =
          this.burst?.key === key ? (this.merging as number) + 1 : 1;
        this.merge(key, SELECTION_MERGE_MS, moves, () =>
          this.record("practice.selection", {
            file,
            selection: selection as Json,
            userEvent,
            moves,
          }),
        );
      },
      onScroll: (fromLine, toLine) =>
        !this.restoring &&
        this.merge("scroll", SCROLL_MERGE_MS, 0, () =>
          this.record("practice.scroll", {
            file,
            fromLine,
            toLine,
          }),
        ),
      onFocus: (focused) =>
        this.record("practice.focus", { file, focused }),
      onClipboard: (kind, ranges, wholeLines) =>
        this.record("practice.clipboard", {
          source: "editor",
          file,
          kind,
          ranges,
          wholeLines,
        }),
      onAssist: (kind, items) =>
        this.record("practice.assist", {
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

  /** Writes the key events waiting, as one observation. */
  private writeKeys(): void {
    clearTimeout(this.keysTimer);
    this.keysTimer = undefined;
    if (this.keys.length) this.recorder.observe("practice.keys", { file: this.file, keys: this.keys });
    this.keys = [];
  }

  /**
   * Every observation but keys goes through here, so a merged burst is written before what
   * follows it and source order matches what happened. Keys carry their own times instead.
   */
  private record<T extends PracticeType>(
    type: T,
    data: PracticeData[T],
    artifacts?: readonly CodeRevisionArtifact[],
  ) {
    this.settle();
    return this.recorder.observe(type, data, artifacts);
  }

  /** Records one applied transaction. Exposed for tests; the editor calls it per change. */
  recordEdit(transaction: Transaction): void {
    this.revision++;
    this.doc = transaction.newDoc;
    const changes = transaction.changes.toJSON() as Json;
    const changesBytes = new TextEncoder().encode(
      JSON.stringify(changes),
    ).length;
    const oversize = changesBytes > EDIT_CHANGES_LIMIT_BYTES;
    const edit = this.record("practice.edit", {
      file: this.file,
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
        "practice.snapshot",
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
      PRACTICE_CAPTURE_VERSION,
      {
        [this.file]: {
          text: this.doc.toString(),
          mediaType: mediaTypeOf((this.options.language ?? "python") as LanguageId),
        },
      },
    );
  }
}

function statusOf(outcome: RunOutcome): RunStatus {
  if (outcome.status === "completed") return "result";
  return outcome.status;
}

/**
 * Focuses the editor where it is, without scrolling the page to it: on a phone the panes stack,
 * and the challenge above the editor stays in view.
 */
function focusInPlace(view: EditorView): void {
  view.contentDOM.focus({ preventScroll: true });
}
