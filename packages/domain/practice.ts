/**
 * The practice stream (docs/telemetry.md): everything recorded while someone works on a
 * challenge, raw. Keys pressed in the editor and their timing, every edit, the code at points,
 * cursor and scroll, copying (from the editor and from the challenge text), help the editor
 * showed, every run with its full outcome, submissions and completion, and the page's state.
 * Interpretation (active time, typos, pace) is derived later, from these, and versioned there.
 */
import { runFeedback, type Envelope } from "./records";
import type { Json } from "./json";

/**
 * 1.2: every observation says who acted (`actor`: person or model), and a model's carry no
 * Terms version. A model's attempt starts `from: "model-run"`, its runs are started `via` a
 * `tool`, and it closes with `run-ended`; the harness records it with the same session code as
 * a person's (docs/model-runs.md).
 * 1.1: type tooltips in practice.assist may be opened by keyboard as well as pointer.
 */
export const PRACTICE_CAPTURE_VERSION = "practice-capture-1.2.0";
/** An edit whose change set is larger than this is recorded without it, plus a snapshot. */
export const EDIT_CHANGES_LIMIT_BYTES = 16384;
/** What this capture does not record. Absence is a gap, not evidence of no activity. */
export const PRACTICE_CAPTURE_GAPS = [
  "pointer-movement-and-hover-without-a-tooltip",
  "pane-focus-and-layout",
  "activity-in-other-tabs-and-apps",
  "writes-cut-short-by-closing-the-page",
] as const;
/**
 * What a model's practice stream also leaves out: a model has no keyboard, pointer, viewport or
 * page, and is not asked the questions after completing. Its own activity is in its model
 * stream (packages/domain/model.ts).
 */
export const MODEL_PRACTICE_CAPTURE_GAPS = [
  "keys-selection-scroll-focus-and-clipboard-do-not-apply-to-a-model",
  "page-state-does-not-apply-to-a-model",
  "after-questions-not-asked",
] as const;

/**
 * A key event in the editor: elapsedMs, kind, the key as typed (`key`, such as "ä"), the
 * physical key (`code`, such as "Quote"), modifiers held (C, A, S, M), and whether it repeats.
 */
export type KeyEvent = readonly [
  elapsedMs: number,
  kind: "down" | "up" | "compose-start" | "compose-end",
  key: string,
  code: string,
  modifiers: string,
  repeat: boolean,
];

export type RunStatus =
  | "queued"
  | "running"
  | "result"
  | "user-error"
  | "runner-error"
  | "timeout"
  | "cancelled";
/** Run examples runs the visible cases; Submit runs every case. */
export type RunPurpose = "examples" | "submit";
/** What a submission's run said. Errored: the code never got to the cases. */
export type SubmitResult = "passed" | "failed" | "errored" | "cancelled";
/**
 * Where a start came from: the picker, quick start, a shared result's invitation, the next challenge suggested
 * after completing one, practising a completed challenge again, or practice opened by its URL
 * with no attempt under way (direct). A model's run starts `model-run`.
 */
export type StartedFrom =
  | "picker"
  | "quick-start"
  | "link"
  | "next"
  | "again"
  | "direct"
  | "model-run";

/**
 * Asked after completing a challenge, every one optional: how hard it felt, how sure they were
 * before submitting, and whether they would have used AI for it at work.
 */
export const AFTER_QUESTIONS = {
  difficulty: ["too-easy", "right", "hard", "too-hard"],
  confidence: ["sure", "fairly", "unsure", "guessing"],
  "would-use-ai": ["yes", "maybe", "no"],
} as const;
export type AfterQuestion = keyof typeof AFTER_QUESTIONS;

/** Coarse facts about where practice runs: comparable groups, never an identifier. */
export interface Environment {
  /** Browser family: chrome, safari, firefox, edge, other. */
  readonly browser: string;
  /** Operating system family: macos, windows, linux, ios, android, chromeos, other. */
  readonly os: string;
  /** The primary pointer: fine (mouse, trackpad), coarse (touch) or none. */
  readonly pointer: "fine" | "coarse" | "none";
  /** The browser's language, such as fi-FI. */
  readonly locale: string;
  /** IANA time zone, such as Europe/Helsinki, and the offset from UTC in minutes. */
  readonly timeZone: string;
  readonly utcOffsetMinutes: number;
  /**
   * What a few physical keys type, where the browser says (Chromium): enough to tell QWERTY,
   * QWERTZ, AZERTY and Nordic layouts apart. Null when unknown.
   */
  readonly layout: Readonly<Record<string, string>> | null;
}

export interface PracticeData {
  /**
   * An attempt began: the first time a challenge is opened, or a start after the last attempt
   * completed. Where from, and for a pick from the list, the search then and the position.
   */
  "practice.started": {
    readonly from: StartedFrom;
    readonly query: string | null;
    /** Its place in the list shown, from 1. */
    readonly position: number | null;
  };
  "practice.opened": {
    readonly revision: number;
    readonly codeArtifactId: string;
    /** The app page practice was opened from (same-origin path), or null. */
    readonly entry: string | null;
    /** The self-reported profile at this moment, or null. */
    readonly profile: Json | null;
    readonly viewport: {
      readonly width: number;
      readonly height: number;
    } | null;
    readonly environment: Environment | null;
    readonly editor: {
      readonly name: string;
      readonly features: readonly string[];
    };
    readonly runtime: Json;
    readonly captureGaps: readonly string[];
  };
  "practice.edit": {
    readonly file: string;
    readonly revision: number;
    /** CodeMirror ChangeSet JSON, or null when it exceeded the limit (see `snapshot`). */
    readonly changes: Json | null;
    readonly changesBytes: number;
    readonly changesTruncated: boolean;
    readonly userEvent: string | null;
    readonly selection: Json;
    readonly docLength: number;
  };
  "practice.snapshot": {
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly reason:
      | "opened"
      | "periodic"
      | "run"
      | "oversize-edit"
      | "restored";
  };
  /** Key events in the editor, in order, about a second at a time. */
  "practice.keys": {
    readonly file: string;
    readonly keys: readonly KeyEvent[];
  };
  /** The cursor or selection moved without changing text; bursts merge within 100 ms. */
  "practice.selection": {
    readonly file: string;
    readonly selection: Json;
    readonly userEvent: string | null;
    readonly moves: number;
  };
  /** The lines in view after scrolling; bursts merge within 250 ms. */
  "practice.scroll": {
    readonly file: string;
    readonly fromLine: number;
    readonly toLine: number;
  };
  "practice.focus": {
    readonly file: string;
    readonly focused: boolean;
  };
  /**
   * Copying. In the editor: where, never the clipboard. From the challenge's own text: what was
   * copied, which is ours, bounded.
   */
  "practice.clipboard":
    | {
        readonly source: "editor";
        readonly file: string;
        readonly kind: "copy" | "cut";
        readonly ranges: readonly {
          readonly from: number;
          readonly to: number;
        }[];
        /** Nothing was selected, so the editor took the cursors' whole lines. */
        readonly wholeLines: boolean;
      }
    | {
        readonly source: "challenge";
        readonly kind: "copy";
        readonly text: string;
        readonly textBytes: number;
        readonly truncated: boolean;
      };
  /** Help the editor showed: diagnostics, or a type tooltip opened by pointer or keyboard. */
  "practice.assist": {
    readonly file: string;
    readonly kind: "diagnostics" | "hover";
    readonly items: Json;
  };
  "practice.run": {
    readonly runId: string;
    /** A button, a keyboard shortcut, or a model's tool call. */
    readonly via: "pointer" | "keyboard" | "tool";
    readonly purpose: RunPurpose;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly status: RunStatus;
    readonly runtime: Json;
    readonly timeoutMs: number;
    /** The raw, bounded runner outcome, for terminal statuses. */
    readonly outcome?: Json;
  };
  /** A Submit's verdict: its cases and the rules the submitted code fires. */
  "practice.submitted": {
    readonly runId: string;
    readonly revision: number;
    readonly codeArtifactId: string;
    readonly result: SubmitResult;
    readonly passed: number;
    readonly total: number;
    /** Rule ids the submitted code fires, in the revision's order. */
    readonly rules: readonly string[];
  };
  /** The submission that completed the attempt: every case passed and no rule fired. */
  "practice.completed": {
    readonly runId: string;
    readonly codeArtifactId: string;
    /** The challenge suggested next, by key, or null when none was. */
    readonly suggested: string | null;
  };
  /**
   * An answer to one of the questions asked after completing (AFTER_QUESTIONS). Answering
   * again records again; the latest answer for the attempt stands.
   */
  "practice.answered": {
    readonly question: AfterQuestion;
    readonly answer: string;
  };
  /** The page became visible or hidden, gained or lost focus, or was resized. */
  "practice.page": {
    readonly visible: boolean;
    readonly focused: boolean;
    readonly width: number;
    readonly height: number;
  };
  "practice.runtime": {
    readonly state: "loading" | "ready" | "unavailable";
    readonly message?: string;
  };
  /** Practice was left: navigating away in the app, or the page being closed. */
  "practice.closed": {
    /** A model's run ended: why is its model stream's `model.ended`. */
    readonly reason: "left" | "page-hidden-for-unload" | "run-ended";
  };
  "practice.capture-gap": {
    /** Inclusive source positions whose observations were not stored. */
    readonly fromSequence: number;
    readonly toSequence: number;
    readonly reason: "buffer-full" | "write-conflict";
  };
}

export type PracticeType = keyof PracticeData;
export type PracticeObservation<T extends PracticeType = PracticeType> =
  Envelope<T, PracticeData[T]>;

/**
 * A submission's result from its run outcome. Passed needs a completed test phase in which every
 * case passed; a compile or runtime error, timeout or runner failure means the code never got to
 * the cases.
 */
export function submitResult(
  checks: readonly { readonly expected: Json }[],
  outcome:
    | {
        status: string;
        phase?: string;
        cases?: readonly { output?: { text: string; truncated: boolean } }[];
      }
    | undefined,
): { result: SubmitResult; passed: number; total: number } {
  const total = checks.length;
  if (!outcome || outcome.status === "cancelled")
    return { result: "cancelled", passed: 0, total };
  if (
    (outcome.status !== "completed" && outcome.status !== "user-error") ||
    outcome.phase !== "tests" ||
    !outcome.cases
  )
    return { result: "errored", passed: 0, total };
  const { correct } = runFeedback(checks, outcome.cases);
  return {
    result: correct === total && total > 0 ? "passed" : "failed",
    passed: correct,
    total,
  };
}
