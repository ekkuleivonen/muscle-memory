/**
 * Raw observations from the tracker: personal-board moves (an issue's status set by hand from
 * its Status menu, or Done by merging a pull request) and replies to review comments.
 * Recorded for every account under the Terms and Privacy Notice it accepted, whose version
 * each move carries; nothing here reads anything beyond the move itself and the board at
 * that moment.
 */
import { boundText, safeIdentifier } from "./capture";
import { canonical, type Json } from "./json";
import type { WorkspaceRecord } from "./workspace";

/**
 * 3.0.0: replies. `observation.board.replied` records a reply to a teammate's review comment
 * on a pull request, with its bounded text; a reply resolves a blocking thread.
 * 2.0.0: moves name the `issue` and its live `issueRevision` (SHA-256 of the revision's
 * content) instead of a versioned Challenge, and only a person merging a pull request moves an
 * issue to Done (`trigger: "pull-request-merged"`, by pointer or keyboard). Earlier versions
 * were never released.
 */
export const BOARD_CAPTURE_VERSION = "board-capture-3.0.0";
/** What this capture does not record. Absence is a gap, not evidence of no activity. */
export const BOARD_CAPTURE_GAPS = [
  "issue-views",
  "searches-and-filters",
  "time-on-page",
  "activity-outside-board-moves-and-replies",
] as const;

export type BoardColumn = "backlog" | "todo" | "in-progress" | "done";
/** How the move was made: pointer, or keyboard (`s`, arrows, Enter; Enter on a link). */
export type BoardMoveVia = "pointer" | "keyboard";
/** What made the move: choosing a status, starting work, or merging a pull request. */
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

/** A reply to a teammate's review comment on one of the person's pull requests. */
export interface BoardReplyData {
  readonly issueKey: string;
  readonly pullRequest: number;
  /** The comment replied to, by id in the revision this observation names. */
  readonly comment: string;
  readonly text: string;
  readonly textBytes: number;
  readonly truncated: boolean;
}

interface BoardData {
  "observation.board.moved": BoardMoveData;
  "observation.board.replied": BoardReplyData;
}

export interface BoardObservation<
  T extends keyof BoardData = keyof BoardData,
> {
  readonly schemaVersion: "1.0.0";
  readonly type: T;
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
  /** As in workspace observations: the issue and the revision live at the time. */
  readonly issue: string;
  readonly issueRevision: string;
  readonly data: BoardData[T];
}

const ISSUE_KEY = /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/;
const REVISION = /^sha256:[0-9a-f]{64}$/;
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
  issue: { id: string; revision: string };
  data: BoardMoveData;
}): BoardObservation<"observation.board.moved"> {
  const { data } = input;
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
  return envelope("observation.board.moved", input, {
      issueKey: data.issueKey,
      from: data.from,
      to: data.to,
      via: data.via,
      trigger: data.trigger,
      onBoardBefore: data.onBoardBefore,
      nudged: data.nudged,
      ...(merged ? { pullRequest: data.pullRequest, runId: data.runId } : {}),
  });
}

/** The longest reply kept; a longer one is cut at a character boundary and marked. */
export const REPLY_LIMIT_BYTES = 8192;

export function boardReply(input: {
  participantId: string;
  sourceId: string;
  sequence: number;
  occurredAt: string;
  termsVersion: string;
  issue: { id: string; revision: string };
  data: { issueKey: string; pullRequest: number; comment: string; text: string };
}): BoardObservation<"observation.board.replied"> {
  const { data } = input;
  if (!ISSUE_KEY.test(data.issueKey)) throw new Error("Unknown issue key.");
  if (!Number.isSafeInteger(data.pullRequest) || data.pullRequest < 1)
    throw new Error("A reply names its pull request.");
  safeIdentifier(data.comment);
  if (!data.text.trim()) throw new Error("A reply needs text.");
  const cut = boundText(data.text, REPLY_LIMIT_BYTES);
  return envelope("observation.board.replied", input, {
    issueKey: data.issueKey,
    pullRequest: data.pullRequest,
    comment: data.comment,
    text: cut.text,
    textBytes: cut.originalBytes,
    truncated: cut.truncated,
  });
}

function envelope<T extends keyof BoardData>(
  type: T,
  input: {
    participantId: string;
    sourceId: string;
    sequence: number;
    occurredAt: string;
    termsVersion: string;
    issue: { id: string; revision: string };
  },
  data: BoardData[T],
): BoardObservation<T> {
  const { participantId, sourceId, sequence, occurredAt, termsVersion, issue } = input;
  safeIdentifier(participantId);
  safeIdentifier(sourceId);
  safeIdentifier(issue.id);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Source positions are positive whole numbers.");
  if (!REVISION.test(issue.revision))
    throw new Error("Board observations name the issue's exact revision.");
  if (Number.isNaN(Date.parse(occurredAt)))
    throw new Error("Board observations need a time.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(termsVersion))
    throw new Error("Board observations name the accepted Terms version.");
  const observationId = `${sourceId}.${sequence}`;
  safeIdentifier(observationId);
  return {
    schemaVersion: "1.0.0",
    type,
    observationId,
    participantId,
    source: { id: sourceId, sequence },
    occurredAt,
    serverReceipt: { status: "absent", reason: "local-only" },
    captureVersion: BOARD_CAPTURE_VERSION,
    captureGaps: [...BOARD_CAPTURE_GAPS],
    consentVersion: `terms-${termsVersion}`,
    researchConsent: false,
    issue: issue.id,
    issueRevision: issue.revision,
    data,
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
        r.payload.includes('"type":"observation.board.'),
    )
    .map((r) => r.payload);
}
