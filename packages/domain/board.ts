/**
 * Raw observations of personal-board moves: an issue's status set by hand (Backlog, Todo,
 * In progress) from its Status menu.
 * Recorded for every account under the Terms and Privacy Notice it accepted, whose version
 * each move carries; nothing here reads anything beyond the move itself and the board at
 * that moment.
 */
import { canonical, type Json } from "./assessment";
import { safeIdentifier } from "./events";
import type { WorkspaceRecord } from "./workspace";

/**
 * 1.5.0: pull requests no longer merge themselves; the person merges one from its page, so the
 * move to Done comes `via` pointer or keyboard, never automatic. Only a pull request whose
 * checks all passed can be merged, as with branch protection.
 * 1.4.0 adds the automatic move to Done when a pull request merges (`via: "automatic"`,
 * `trigger: "pull-request-merged"`, with the pull request's number and the run that checked
 * it); 1.3.0 adds `trigger`: the Status menu, or Start work (which moves an issue to In progress);
 * 1.2.0 records every account's moves, with the accepted Terms version as `consentVersion`
 * instead of a separate opt-in; 1.1.0 added In progress and the Status menu input; 1.0.0
 * covered backlog <-> Todo. Stored records keep theirs.
 */
export const BOARD_CAPTURE_VERSION = "board-capture-1.5.0";
/** What this capture does not record. Absence is a gap, not evidence of no activity. */
export const BOARD_CAPTURE_GAPS = [
  "issue-views",
  "searches-and-filters",
  "time-on-page",
  "activity-outside-board-moves",
] as const;

export type BoardColumn = "backlog" | "todo" | "in-progress" | "done";
/**
 * How the move was made: pointer, or keyboard (`s`, arrows, Enter; Enter on a link). Automatic
 * appears only before 1.5.0, when a pull request merged itself.
 */
export type BoardMoveVia = "pointer" | "keyboard" | "automatic";
/** What made the move: choosing a status, starting work, or a pull request merging. */
export type BoardMoveTrigger =
  | "status-menu"
  | "start-work"
  | "pull-request-merged";

export interface BoardMoveData {
  readonly issueKey: string;
  readonly from: BoardColumn;
  readonly to: BoardColumn;
  readonly via: BoardMoveVia;
  readonly trigger: BoardMoveTrigger;
  /** Issues on the board (Todo and In progress) just before the move. */
  readonly onBoardBefore: number;
  /** Whether the soft limit asked "finish one first?" before this move. */
  readonly nudged: boolean;
  /** For pull-request-merged: the pull request, and the workspace run that checked it. */
  readonly pullRequest?: number;
  readonly runId?: string;
}

export interface BoardObservation {
  readonly schemaVersion: "1.0.0";
  readonly type: "observation.board.moved";
  readonly observationId: string;
  readonly participantId: string;
  readonly source: { readonly id: string; readonly sequence: number };
  readonly occurredAt: string;
  readonly serverReceipt: {
    readonly status: "absent";
    readonly reason: "local-only";
  };
  readonly captureVersion: string;
  readonly captureGaps: readonly string[];
  /** The Terms and Privacy Notice version the account accepted, e.g. terms-2026-10-24. */
  readonly consentVersion: string;
  readonly researchConsent: false;
  /** Exact content shown, as in workspace observations: challenge.<id>.<version>. */
  readonly challengeArtifactId: string;
  readonly data: BoardMoveData;
}

const ISSUE_KEY = /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COLUMNS: readonly BoardColumn[] = [
  "backlog",
  "todo",
  "in-progress",
  "done",
];
const VIAS: readonly BoardMoveVia[] = ["pointer", "keyboard"];
const TRIGGERS: readonly BoardMoveTrigger[] = [
  "status-menu",
  "start-work",
  "pull-request-merged",
];

export function boardMove(input: {
  participantId: string;
  sourceId: string;
  sequence: number;
  occurredAt: string;
  /** The accepted Terms and Privacy Notice version. */
  termsVersion: string;
  challenge: { id: string; version: string };
  data: BoardMoveData;
}): BoardObservation {
  const {
    participantId,
    sourceId,
    sequence,
    occurredAt,
    termsVersion,
    challenge,
    data,
  } = input;
  safeIdentifier(participantId);
  safeIdentifier(sourceId);
  safeIdentifier(challenge.id);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Source positions are positive whole numbers.");
  if (!VERSION.test(challenge.version))
    throw new Error("Board moves name an exact Challenge version.");
  if (Number.isNaN(Date.parse(occurredAt)))
    throw new Error("Board moves need a time.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(termsVersion))
    throw new Error("Board moves name the accepted Terms version.");
  if (!ISSUE_KEY.test(data.issueKey)) throw new Error("Unknown issue key.");
  if (
    !COLUMNS.includes(data.from) ||
    !COLUMNS.includes(data.to) ||
    data.from === data.to ||
    data.from === "done"
  )
    throw new Error(
      "A move goes between Backlog, Todo and In progress, or on to Done.",
    );
  if (!VIAS.includes(data.via))
    throw new Error("Unknown way of moving an issue.");
  if (!TRIGGERS.includes(data.trigger))
    throw new Error("Unknown trigger for a move.");
  // Done comes only from merging a pull request, which the person does by hand.
  const merged = data.trigger === "pull-request-merged";
  if (
    (data.to === "done") !== merged ||
    (merged &&
      (typeof data.runId !== "string" ||
        !Number.isSafeInteger(data.pullRequest) ||
        data.pullRequest! < 1))
  )
    throw new Error("Only a merged pull request moves an issue to Done.");
  if (merged) safeIdentifier(data.runId!);
  if (!Number.isSafeInteger(data.onBoardBefore) || data.onBoardBefore < 0)
    throw new Error("Board count must be a whole number.");
  if (typeof data.nudged !== "boolean")
    throw new Error("nudged is true or false.");
  const observationId = `${sourceId}.${sequence}`;
  safeIdentifier(observationId);
  return {
    schemaVersion: "1.0.0",
    type: "observation.board.moved",
    observationId,
    participantId,
    source: { id: sourceId, sequence },
    occurredAt,
    serverReceipt: { status: "absent", reason: "local-only" },
    captureVersion: BOARD_CAPTURE_VERSION,
    captureGaps: [...BOARD_CAPTURE_GAPS],
    consentVersion: `terms-${termsVersion}`,
    researchConsent: false,
    challengeArtifactId: `challenge.${challenge.id}.${challenge.version}`,
    data: {
      issueKey: data.issueKey,
      from: data.from,
      to: data.to,
      via: data.via,
      trigger: data.trigger,
      onBoardBefore: data.onBoardBefore,
      nudged: data.nudged,
      ...(merged ? { pullRequest: data.pullRequest, runId: data.runId } : {}),
    },
  };
}

/** Stored like workspace observations: one canonical payload per stable ID. */
export function boardRecord(observation: BoardObservation): WorkspaceRecord {
  return {
    recordId: observation.observationId,
    kind: "observation",
    participantId: observation.participantId,
    payload: canonical(observation as unknown as Json),
  };
}

/** Board observations among stored records, for export. */
export function boardPayloads(records: readonly WorkspaceRecord[]): string[] {
  return records
    .filter(
      (r) =>
        r.kind === "observation" &&
        r.payload.includes('"type":"observation.board.moved"'),
    )
    .map((r) => r.payload);
}
