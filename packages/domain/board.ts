/**
 * Raw observations from the tracker, every page outside the IDE: pages viewed (with their
 * search and filters), the page becoming visible, hidden, focused or resized, personal-board
 * moves (an issue's status set by hand, or Done by merging a pull request), replies to review
 * comments and the onboarding and settings answers. Recorded for every account under the Terms
 * and Privacy Notice it accepted, whose version each observation carries. Typing in text
 * fields is not recorded key by key: a search is recorded as the query it produced, a reply as
 * the text sent.
 */
import { boundText, safeIdentifier } from "./capture";
import { canonical, type Json } from "./json";
import type { WorkspaceRecord } from "./workspace";

/**
 * 5.0.0: the referral loop. `arrived` records how someone first came in (the landing page,
 * and the referral code of the shared result that brought them, if any), once they have
 * accepted the Terms; `shared` records sharing a result card (which channel, and the card).
 * A referral code is a random code per device, never the participant ID. `result` records the
 * numbers on a merged pull request's result card (metrics version 2, see apps/web/lib/result),
 * which the aggregate percentiles are computed from. `profile` can come `from: "play"` (the
 * language picked for the test, as the languages answer) or `from: "result"` (the questions
 * answered on a result card).
 * 4.0.0: everything in the tracker. Every observation has `elapsedMs`, a monotonic clock from
 * the start of its source stream (a page load). New: `viewed` (each page, with its query and
 * the page before it), `page` (visible, focused, size) and `profile` (the onboarding and
 * settings answers when saved). `issue` and `issueRevision` are null on pages that are not
 * about one issue.
 * 3.0.0: replies. `observation.board.replied` records a reply to a teammate's review comment
 * on a pull request, with its bounded text; a reply resolves a blocking thread.
 * 2.0.0: moves name the `issue` and its live `issueRevision` (SHA-256 of the revision's
 * content) instead of a versioned Challenge, and only a person merging a pull request moves an
 * issue to Done (`trigger: "pull-request-merged"`, by pointer or keyboard). Earlier versions
 * were never released.
 */
export const BOARD_CAPTURE_VERSION = "board-capture-5.0.0";
/** What this capture does not record. Absence is a gap, not evidence of no activity. */
export const BOARD_CAPTURE_GAPS = [
  "visits-before-accepting-the-terms",
  "keystrokes-in-text-fields",
  "pointer-movement-and-hover",
  "menus-opened-without-a-choice",
  "activity-in-other-tabs-and-apps",
  "writes-cut-short-by-closing-the-page",
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

/** A page of the app was shown: its path, its query string, and the app page before it. */
export interface BoardViewData {
  readonly path: string;
  readonly query: string;
  readonly previous: string | null;
}

export interface BoardPageData {
  readonly visible: boolean;
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
}

/** The answers given in onboarding or settings (or on /play or a result card), as saved. */
export interface BoardProfileData {
  readonly from: "onboarding" | "settings" | "play" | "result";
  readonly answers: Json;
}

/** How someone first came in: recorded once, after they accept the Terms. */
export interface BoardArrivalData {
  /** The referral code in the link that brought them, if any. */
  readonly ref: string | null;
  /** The first app page they landed on, and when (before the Terms, so not recorded then). */
  readonly landing: string;
  readonly landedAt: string;
}

/** A merged pull request's result card: its numbers, as the person saw them. */
export interface BoardResultData {
  readonly issueKey: string;
  readonly pullRequest: number;
  readonly language: string;
  /** Version of the metric definitions. */
  readonly metrics: 2;
  readonly values: Json;
}

/** A result card shared: where to, and what it said. */
export interface BoardShareData {
  readonly issueKey: string;
  readonly channel: "copy" | "x" | "linkedin" | "native";
  /** This device's referral code, carried by the shared link. */
  readonly ref: string;
  readonly card: Json;
}

interface BoardData {
  "observation.board.moved": BoardMoveData;
  "observation.board.replied": BoardReplyData;
  "observation.board.viewed": BoardViewData;
  "observation.board.page": BoardPageData;
  "observation.board.profile": BoardProfileData;
  "observation.board.arrived": BoardArrivalData;
  "observation.board.shared": BoardShareData;
  "observation.board.result": BoardResultData;
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
  /** Milliseconds since the page load started its source stream, on a monotonic clock. */
  readonly elapsedMs: number;
  readonly serverReceipt: {
    readonly status: "absent";
    readonly reason: "local-only";
  };
  readonly captureVersion: string;
  readonly captureGaps: readonly string[];
  /** The Terms and Privacy Notice version the account accepted, e.g. terms-2026-10-24. */
  readonly consentVersion: string;
  readonly researchConsent: false;
  /** As in workspace observations: the issue and the revision live at the time; null when not about one. */
  readonly issue: string | null;
  readonly issueRevision: string | null;
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
  elapsedMs: number;
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
  elapsedMs: number;
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
    elapsedMs: number;
    termsVersion: string;
    issue: { id: string; revision: string } | null;
  },
  data: BoardData[T],
): BoardObservation<T> {
  const { participantId, sourceId, sequence, occurredAt, elapsedMs, termsVersion, issue } =
    input;
  safeIdentifier(participantId);
  safeIdentifier(sourceId);
  if (issue) safeIdentifier(issue.id);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Source positions are positive whole numbers.");
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
    throw new Error("Board observations need their elapsed time.");
  if (issue && !REVISION.test(issue.revision))
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
    elapsedMs,
    serverReceipt: { status: "absent", reason: "local-only" },
    captureVersion: BOARD_CAPTURE_VERSION,
    captureGaps: [...BOARD_CAPTURE_GAPS],
    consentVersion: `terms-${termsVersion}`,
    researchConsent: false,
    issue: issue?.id ?? null,
    issueRevision: issue?.revision ?? null,
    data,
  };
}

/** The common fields of a board observation before its data. */
export interface BoardBase {
  participantId: string;
  sourceId: string;
  sequence: number;
  occurredAt: string;
  elapsedMs: number;
  termsVersion: string;
}

const PAGE_PATH = /^\/[\w\-./%~]*$/;

export function boardView(
  input: BoardBase & { issue: { id: string; revision: string } | null; data: BoardViewData },
): BoardObservation<"observation.board.viewed"> {
  const { path, query, previous } = input.data;
  if (!PAGE_PATH.test(path) || (previous !== null && !PAGE_PATH.test(previous.split("?")[0])))
    throw new Error("A page view names app paths.");
  return envelope("observation.board.viewed", input, {
    path,
    query: boundText(query, 2048).text,
    previous,
  });
}

export function boardPage(
  input: BoardBase & { data: BoardPageData },
): BoardObservation<"observation.board.page"> {
  const { visible, focused, width, height } = input.data;
  return envelope("observation.board.page", { ...input, issue: null }, {
    visible: Boolean(visible),
    focused: Boolean(focused),
    width: Math.round(width),
    height: Math.round(height),
  });
}

export function boardProfile(
  input: BoardBase & { data: BoardProfileData },
): BoardObservation<"observation.board.profile"> {
  if (!["onboarding", "settings", "play", "result"].includes(input.data.from))
    throw new Error("Profile answers come from onboarding, settings or the test.");
  return envelope("observation.board.profile", { ...input, issue: null }, input.data);
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

const REFERRAL = /^[a-z0-9]{6,32}$/;

export function boardArrival(
  input: BoardBase & { data: BoardArrivalData },
): BoardObservation<"observation.board.arrived"> {
  const { ref, landing, landedAt } = input.data;
  if (ref !== null && !REFERRAL.test(ref)) throw new Error("Unknown referral code.");
  if (!PAGE_PATH.test(landing.split("?")[0])) throw new Error("A landing page is an app path.");
  if (Number.isNaN(Date.parse(landedAt))) throw new Error("An arrival needs its time.");
  return envelope("observation.board.arrived", { ...input, issue: null }, {
    ref,
    landing: boundText(landing, 2048).text,
    landedAt,
  });
}

export function boardShare(
  input: BoardBase & { issue: { id: string; revision: string }; data: BoardShareData },
): BoardObservation<"observation.board.shared"> {
  const { issueKey, channel, ref, card } = input.data;
  if (!ISSUE_KEY.test(issueKey)) throw new Error("Unknown issue key.");
  if (!["copy", "x", "linkedin", "native"].includes(channel)) throw new Error("Unknown channel.");
  if (!REFERRAL.test(ref)) throw new Error("Unknown referral code.");
  return envelope("observation.board.shared", input, { issueKey, channel, ref, card });
}

export function boardResult(
  input: BoardBase & { issue: { id: string; revision: string }; data: BoardResultData },
): BoardObservation<"observation.board.result"> {
  const { issueKey, pullRequest, language, metrics, values } = input.data;
  if (!ISSUE_KEY.test(issueKey)) throw new Error("Unknown issue key.");
  if (!Number.isSafeInteger(pullRequest) || pullRequest < 1)
    throw new Error("A result names its pull request.");
  if (metrics !== 2) throw new Error("Unknown metrics version.");
  if (!/^[a-z+#]{1,16}$/.test(language)) throw new Error("Unknown language.");
  return envelope("observation.board.result", input, { issueKey, pullRequest, language, metrics, values });
}
