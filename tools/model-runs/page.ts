/**
 * Practice in a headless page, for a model: the real practice session (editor, recorder,
 * runner sandbox, type checker and verdict) with no React around it. The harness drives it
 * through `window.harness`, one call per thing a person can do, and receives every record the
 * session stores through `window.mmWrite`. Bundled and served by ./practice.ts.
 */
import type { Revision } from "../../packages/content/model";
import type { StoredRecord } from "../../packages/domain/records";
import type { WriteOutcome } from "../../packages/capture/recorder";
import { engineFor, Runner } from "../../packages/runner/runner";
import { RUN_TIMEOUT_MS } from "../../packages/runner/policy";
import { PracticeSession, type RunView } from "../../apps/web/app/practice/session";
import { checksTypes, TypeChecker, type TypeDiagnostic } from "../../apps/web/app/practice/type-checker";
import type { LanguageId } from "../../apps/web/lib/languages";

export interface OpenConfig {
  readonly key: string;
  readonly revisionId: string;
  readonly revision: Revision;
  readonly participantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly attemptId: string;
  /** The run's clock origin: performance.timeOrigin + performance.now(), in the harness. */
  readonly origin: number;
  readonly editor: { readonly name: string; readonly features: readonly string[] };
  readonly captureGaps: readonly string[];
}

export interface Opened {
  readonly runtimeLabel: string;
  /** Whether type errors are shown for this language, as squiggles are to a person. */
  readonly typeChecked: boolean;
}

/** Practice positions an action caused, inclusive; null when it caused none. */
export type Range = { from: number; to: number } | null;

export interface Edited {
  readonly applied: boolean;
  readonly code: string;
  readonly diagnostics: TypeDiagnostic[] | null;
  readonly practice: Range;
}

export interface Ran {
  readonly run: RunView;
  readonly completed: boolean;
  readonly practice: Range;
}

declare global {
  interface Window {
    mmWrite(records: readonly StoredRecord[]): Promise<WriteOutcome[]>;
    harness: Harness;
  }
}

/** The editor shows type errors 500 ms after typing stops; a little longer lets them land. */
const LINT_SETTLE_MS = 600;

class Harness {
  private session?: PracticeSession;
  private runner?: Runner;
  private types?: TypeChecker;
  private lastRun?: RunView;
  private completed = false;

  async open(config: OpenConfig): Promise<Opened> {
    const { revision } = config;
    const language = revision.language as LanguageId;
    const engine = engineFor(language);
    if (!engine) throw new Error(`${language} cannot run in the browser`);
    const host = document.body.appendChild(document.createElement("div"));
    host.hidden = true;
    this.runner = new Runner(engine, host, { timeoutMs: RUN_TIMEOUT_MS });
    this.types = checksTypes(language) ? new TypeChecker(revision.file) : undefined;
    const clock = () => performance.timeOrigin + performance.now();
    this.session = new PracticeSession({
      participantId: config.participantId,
      actor: "model",
      termsVersion: null,
      sessionId: config.sessionId,
      sourceId: config.sourceId,
      clock: { monotonic: clock, origin: config.origin },
      challenge: { key: config.key, revision, revisionId: config.revisionId },
      attemptId: config.attemptId,
      started: { from: "model-run", query: null, position: null },
      sink: { write: (records) => window.mmWrite(records) },
      code: revision.starter,
      language,
      types: this.types,
      editor: config.editor,
      captureGaps: config.captureGaps,
      focusOnMount: false,
      runner: () => this.runner!,
      onRun: (run) => (this.lastRun = run),
      onCompleted: () => (this.completed = true),
      onEditedAfterRun: () => undefined,
    });
    await this.session.mount(document.body.appendChild(document.createElement("div")));
    this.session.runtimeState("loading");
    try {
      await this.runner.ready();
      this.session.runtimeState("ready");
    } catch (cause) {
      this.session.runtimeState("unavailable", String((cause as Error)?.message ?? cause));
      throw cause;
    }
    // Squiggles on the starter show soon after opening, for a person too: let them land now
    // rather than inside the first tool call.
    if (this.types) await this.settleTypes();
    await this.session.recorder.flush();
    return { runtimeLabel: engine.label, typeChecked: Boolean(this.types) };
  }

  code(): string {
    return this.live.code();
  }

  /** Replaces `old`, which must occur exactly once, with `replacement`. */
  edit(old: string, replacement: string): Promise<Edited> {
    const code = this.live.code();
    const at = code.indexOf(old);
    if (!old || at < 0 || code.indexOf(old, at + 1) >= 0)
      return this.observed(false, () => undefined);
    return this.observed(true, () =>
      this.live.apply({ from: at, to: at + old.length, insert: replacement }, "model.edit"),
    );
  }

  write(text: string): Promise<Edited> {
    return this.observed(true, () =>
      this.live.apply({ from: 0, to: this.live.code().length, insert: text }, "model.write"),
    );
  }

  async run(purpose: "examples" | "submit"): Promise<Ran> {
    const before = this.position();
    this.lastRun = undefined;
    await this.live.run(purpose, "tool");
    await this.live.recorder.flush();
    if (!this.lastRun) throw new Error("the run did not start");
    return { run: this.lastRun, completed: this.completed, practice: this.range(before) };
  }

  async close(): Promise<Range> {
    const before = this.position();
    await this.live.close(false, "run-ended");
    this.types?.dispose();
    this.runner?.dispose();
    return this.range(before);
  }

  private async observed(applied: boolean, change: () => void): Promise<Edited> {
    const before = this.position();
    change();
    const diagnostics = this.types
      ? applied
        ? await this.settleTypes()
        : await this.types.check(this.live.code())
      : null;
    await this.live.recorder.flush();
    return { applied, code: this.live.code(), diagnostics, practice: this.range(before) };
  }

  /**
   * Waits for the editor's own check (recorded as practice.assist when what it shows changes),
   * then returns what it shows: the checker answers in order, so a check queued after the
   * editor's sees the same result after it.
   */
  private async settleTypes(): Promise<TypeDiagnostic[]> {
    await new Promise((done) => setTimeout(done, LINT_SETTLE_MS));
    const diagnostics = await this.types!.check(this.live.code());
    await new Promise((done) => setTimeout(done, 0));
    return diagnostics;
  }

  private position(): number {
    return this.live.recorder.status().lastSequence;
  }

  private range(before: number): Range {
    const after = this.position();
    return after > before ? { from: before + 1, to: after } : null;
  }

  private get live(): PracticeSession {
    if (!this.session) throw new Error("practice is not open");
    return this.session;
  }
}

window.harness = new Harness();
