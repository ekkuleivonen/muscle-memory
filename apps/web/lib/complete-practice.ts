import {
  boardMove,
  boardRecord,
  boardResult,
} from "../../../packages/domain/board";
import { randomId } from "../../../packages/browser/random-id";
import type { PracticeStore } from "../../../packages/browser/practice-store";
import type { Revision } from "../../../packages/content/model";
import {
  activeCount,
  complete,
  parseBoard,
  serializeBoard,
  statusOf,
  BOARD_CHANGE,
  BOARD_KEY,
} from "./board";
import { completionEligibility, completions } from "./completion";
import { attemptRecords } from "./attempts";
import { metricsOf } from "./result";

const sourceId = `completion-${randomId()}`;
let sequence = 0;

/** No await between gate and append: concurrent tab writes serialize in the same IDB transaction. */
export async function completePractice(
  store: PracticeStore,
  input: {
    participantId: string;
    termsVersion: string;
    issue: { key: string; slug: string; revision: string; language: string };
    revisionFor: (id: string) => Revision | undefined;
    currentFiles: () => Readonly<Record<string, string>>;
    ready: () => boolean;
  },
): Promise<boolean> {
  const { issue } = input;
  let at = "";
  const written = await store.commitWorkspace((records) => {
    const own = attemptRecords(records, issue.slug);
    if (!input.ready() || completions(own, issue.slug).length) return [];
    const gate = completionEligibility({
      records: own,
      issue: issue.slug,
      revision: issue.revision,
      revisionFor: input.revisionFor,
      currentFiles: input.currentFiles(),
    });
    if (gate.blocker !== null || !gate.latest || !gate.via) return [];
    const board = parseBoard(localStorage.getItem(BOARD_KEY));
    const from = statusOf(board, issue.key);
    if (from === "done") return [];
    at = new Date().toISOString();
    const base = {
      participantId: input.participantId,
      sourceId,
      occurredAt: at,
      elapsedMs: Math.round(performance.now() * 10) / 10,
      termsVersion: input.termsVersion,
      issue: { id: issue.slug, revision: issue.revision },
    };
    return [
      boardRecord(
        boardMove({
          ...base,
          sequence: ++sequence,
          data: {
            issueKey: issue.key,
            from,
            to: "done",
            via: gate.via,
            trigger: "checks-passed",
            onBoardBefore: activeCount(board),
            nudged: false,
            pullRequest: allNumber(own, gate.latest.runId),
            runId: gate.latest.runId,
          },
        }),
      ),
      boardRecord(
        boardResult({
          ...base,
          sequence: ++sequence,
          data: {
            issueKey: issue.key,
            pullRequest: allNumber(own, gate.latest.runId),
            language: issue.language,
            metrics: 2,
            values: metricsOf(
              own,
              issue.slug,
              at,
              input.revisionFor,
            ) as unknown as import("../../../packages/domain/json").Json,
          },
        }),
      ),
    ];
  });
  // Done becomes visible only after the completion and its result were durably committed.
  if (written) {
    localStorage.setItem(
      BOARD_KEY,
      serializeBoard(
        complete(parseBoard(localStorage.getItem(BOARD_KEY)), issue.key, at),
      ),
    );
    window.dispatchEvent(new Event(BOARD_CHANGE));
  }
  return written;
}

function allNumber(
  records: readonly import("../../../packages/domain/workspace").WorkspaceRecord[],
  runId: string,
): number {
  for (const record of records)
    try {
      const v = JSON.parse(record.payload);
      if (
        v.type === "observation.workspace.pull-request" &&
        v.data.runId === runId
      )
        return Number(v.data.number);
    } catch {
      /* Ignore unreadable history. */
    }
  return 0;
}
