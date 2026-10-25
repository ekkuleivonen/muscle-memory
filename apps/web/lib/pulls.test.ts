import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import {
  allPullRequests,
  mergedPullRequests,
} from "./pulls";

import { live } from "./test-fixtures";

const fixture = live("frequency-map");
const cases = fixture.revision.checks.cases;

let sequence = 0;
function observation(
  type: string,
  minute: number,
  data: Record<string, unknown>,
): WorkspaceRecord {
  sequence += 1;
  return {
    recordId: `obs-${sequence}`,
    kind: "observation",
    participantId: "p",
    payload: JSON.stringify({
      type,
      occurredAt: new Date(Date.UTC(2026, 9, 24, 9, minute)).toISOString(),
      source: { id: "s", sequence },
      issue: "frequency-map",
      issueRevision: fixture.id,
      data,
    }),
  };
}

/** A completed run whose first `passing` cases return the expected value. */
function outcome(passing: number) {
  return {
    status: "completed",
    phase: "tests",
    cases: cases.map(({ expected }, index) => ({
      index,
      output: {
        text: JSON.stringify(index < passing ? expected : "wrong"),
        bytes: 1,
        truncated: false,
      },
    })),
  };
}

function code(revision: number, text: string): WorkspaceRecord {
  return {
    recordId: `s.code.${revision}`,
    kind: "artifact",
    participantId: "p",
    payload: JSON.stringify({
      files: { [fixture.path]: { text, capture: { truncated: false } } },
    }),
  };
}

const total = cases.length;
const records: WorkspaceRecord[] = [
  observation("observation.workspace.opened", 0, {}),
  observation("observation.workspace.edit", 1, {}),
  observation("observation.workspace.edit", 2, {}),
  observation("observation.workspace.run", 3, {
    runId: "r1",
    purpose: "local",
    status: "result",
    outcome: outcome(1),
  }),
  observation("observation.workspace.run", 4, {
    runId: "p1",
    purpose: "pull-request",
    status: "queued",
  }),
  observation("observation.workspace.run", 4, {
    runId: "p1",
    purpose: "pull-request",
    status: "result",
    outcome: outcome(2),
  }),
  observation("observation.workspace.pull-request", 4, {
    number: 1,
    runId: "p1",
    revision: 2,
    codeArtifactId: "s.code.2",
    result: "checks-failed",
    passed: 2,
    total,
  }),
  observation("observation.workspace.edit", 10, {}),
  observation("observation.workspace.run", 12, {
    runId: "r2",
    purpose: "local",
    status: "result",
    outcome: outcome(total),
  }),
  observation("observation.workspace.run", 15, {
    runId: "p2",
    purpose: "pull-request",
    status: "queued",
  }),
  observation("observation.workspace.run", 15, {
    runId: "p2",
    purpose: "pull-request",
    status: "result",
    outcome: outcome(total),
  }),
  observation("observation.workspace.pull-request", 15, {
    number: 2,
    runId: "p2",
    revision: 3,
    codeArtifactId: "s.code.3",
    result: "checks-passed",
    passed: total,
    total,
  }),
  observation("observation.board.moved", 20, {
    issueKey: "PY-002",
    from: "in-progress",
    to: "done",
    via: "pointer",
    trigger: "pull-request-merged",
    pullRequest: 2,
    runId: "p2",
  }),
  code(3, "def frequency_map(words):\n    return {}\n"),
];

test("pull requests are listed newest first, open until the person merges one", () => {
  const pulls = allPullRequests(records);
  assert.deepEqual(
    pulls.map((p) => [p.issue, p.issueRevision, p.number, p.result, p.state]),
    [
      ["frequency-map", fixture.id, 2, "checks-passed", "merged"],
      ["frequency-map", fixture.id, 1, "checks-failed", "open"],
    ],
  );
  // #1 stays open (failing checks never close it), but its issue is Done through #2.
  assert.equal(pulls[1].otherMerged, 2);
  assert.deepEqual([...mergedPullRequests(records, "frequency-map")], [2]);
  // Without the merge, passing checks leave it open.
  const unmerged = records.filter(
    (r) => !r.payload.includes("observation.board.moved"),
  );
  assert.equal(allPullRequests(unmerged)[0].state, "open");
});
