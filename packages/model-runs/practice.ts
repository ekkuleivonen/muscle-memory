/**
 * Practice for a model, in a browser page: the real practice session (editor, recorder, runner
 * sandbox, type checker and verdict) with no React around it, one call per thing a person can
 * do. Several can run in one page, each in hidden elements of its own. Every record the session
 * stores is kept in memory, in write order, by the same rule as the device's store: an
 * identical record is a duplicate, a changed one a conflict. The admin runs it in the
 * operator's tab; tools/model-runs/page.ts runs it in headless Chromium.
 */
import type { Revision } from "../content/model";
import type { StoredRecord } from "../domain/records";
import type { WriteOutcome } from "../capture/recorder";
import { engineFor, Runner } from "../runner/runner";
import { RUN_TIMEOUT_MS } from "../runner/policy";
import { PracticeSession, type RunView } from "../../apps/web/app/practice/session";
import {
  checksTypes,
  TypeChecker,
  type TypeDiagnostic,
} from "../../apps/web/app/practice/type-checker";
import type { LanguageId } from "../../apps/web/lib/languages";

export interface OpenConfig {
  readonly key: string;
  readonly revisionId: string;
  readonly revision: Revision;
  readonly participantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly attemptId: string;
  /** The run's clock origin (`runClock()` when the run began). */
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

/** What the loop needs of practice: this, in a page, or a stand-in in tests. */
export interface Practice {
  readonly opened: Opened;
  readonly records: readonly StoredRecord[];
  edit(old: string, replacement: string): Promise<Edited>;
  write(text: string): Promise<Edited>;
  run(purpose: "examples" | "submit"): Promise<Ran>;
  close(): Promise<Range>;
}

/** A run's clock: wall-clock-anchored and monotonic, the same in Node and in a page. */
export function runClock(): number {
  return performance.timeOrigin + performance.now();
}

/** The editor shows type errors 500 ms after typing stops; a little longer lets them land. */
const LINT_SETTLE_MS = 600;

export class BrowserPractice implements Practice {
  readonly records: StoredRecord[] = [];
  opened!: Opened;
  private readonly byId = new Map<string, string>();
  private session!: PracticeSession;
  private runner!: Runner;
  private types?: TypeChecker;
  private lastRun?: RunView;
  private completed = false;

  private constructor(private readonly host: HTMLElement) {}

  /** Opens practice on one revision inside `parent`, ready to run. */
  static async open(config: OpenConfig, parent: HTMLElement): Promise<BrowserPractice> {
    const host = parent.appendChild(document.createElement("div"));
    host.hidden = true;
    const practice = new BrowserPractice(host);
    try {
      await practice.start(config);
    } catch (error) {
      host.remove();
      throw error;
    }
    return practice;
  }

  private async start(config: OpenConfig): Promise<void> {
    const { revision } = config;
    const language = revision.language as LanguageId;
    const engine = engineFor(language);
    if (!engine) throw new Error(`${language} cannot run in the browser`);
    this.runner = new Runner(engine, this.host.appendChild(document.createElement("div")), {
      timeoutMs: RUN_TIMEOUT_MS,
    });
    this.types = checksTypes(language) ? new TypeChecker(revision.file) : undefined;
    this.session = new PracticeSession({
      participantId: config.participantId,
      actor: "model",
      termsVersion: null,
      sessionId: config.sessionId,
      sourceId: config.sourceId,
      clock: { monotonic: runClock, origin: config.origin },
      challenge: { key: config.key, revision, revisionId: config.revisionId },
      attemptId: config.attemptId,
      started: { from: "model-run", query: null, position: null },
      sink: { write: async (records) => this.store(records) },
      code: revision.starter,
      language,
      types: this.types,
      editor: config.editor,
      captureGaps: config.captureGaps,
      focusOnMount: false,
      runner: () => this.runner,
      onRun: (run) => (this.lastRun = run),
      onCompleted: () => (this.completed = true),
      onEditedAfterRun: () => undefined,
    });
    await this.session.mount(this.host.appendChild(document.createElement("div")));
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
    this.opened = { runtimeLabel: engine.label, typeChecked: Boolean(this.types) };
  }

  /** The device store's rule: an identical record is a duplicate, a changed one a conflict. */
  private store(records: readonly StoredRecord[]): WriteOutcome[] {
    return records.map((record) => {
      const stored = this.byId.get(record.recordId);
      if (stored !== undefined) return stored === record.payload ? "duplicate" : "conflict";
      this.byId.set(record.recordId, record.payload);
      this.records.push(record);
      return "written";
    });
  }

  code(): string {
    return this.session.code();
  }

  /** Replaces `old`, which must occur exactly once, with `replacement`. */
  edit(old: string, replacement: string): Promise<Edited> {
    const code = this.session.code();
    const at = code.indexOf(old);
    if (!old || at < 0 || code.indexOf(old, at + 1) >= 0)
      return this.observed(false, () => undefined);
    return this.observed(true, () =>
      this.session.apply({ from: at, to: at + old.length, insert: replacement }, "model.edit"),
    );
  }

  write(text: string): Promise<Edited> {
    return this.observed(true, () =>
      this.session.apply({ from: 0, to: this.session.code().length, insert: text }, "model.write"),
    );
  }

  async run(purpose: "examples" | "submit"): Promise<Ran> {
    const before = this.position();
    this.lastRun = undefined;
    await this.session.run(purpose, "tool");
    await this.session.recorder.flush();
    if (!this.lastRun) throw new Error("the run did not start");
    return { run: this.lastRun, completed: this.completed, practice: this.range(before) };
  }

  /** Records that the run ended, writes everything buffered, and frees the sandbox. */
  async close(): Promise<Range> {
    const before = this.position();
    await this.session.close(false, "run-ended");
    this.types?.dispose();
    this.runner.dispose();
    this.host.remove();
    return this.range(before);
  }

  private async observed(applied: boolean, change: () => void): Promise<Edited> {
    const before = this.position();
    change();
    const diagnostics = this.types
      ? applied
        ? await this.settleTypes()
        : await this.types.check(this.session.code())
      : null;
    await this.session.recorder.flush();
    return { applied, code: this.session.code(), diagnostics, practice: this.range(before) };
  }

  /**
   * Waits for the editor's own check (recorded as practice.assist when what it shows changes),
   * then returns what it shows: the checker answers in order, so a check queued after the
   * editor's sees the same result after it.
   */
  private async settleTypes(): Promise<TypeDiagnostic[]> {
    await new Promise((done) => setTimeout(done, LINT_SETTLE_MS));
    const diagnostics = await this.types!.check(this.session.code());
    await new Promise((done) => setTimeout(done, 0));
    return diagnostics;
  }

  private position(): number {
    return this.session.recorder.status().lastSequence;
  }

  private range(before: number): Range {
    const after = this.position();
    return after > before ? { from: before + 1, to: after } : null;
  }
}
