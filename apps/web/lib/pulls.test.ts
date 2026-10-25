import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { diffLines, diffStats, hunks } from "./diff";
import {
  allPullRequests,
  closedPullRequests,
  duration,
  mergedPullRequests,
  pullRequestDetail,
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

test("the latest push includes its own result even when recorded after the PR event", () => {
  const first = observation("observation.workspace.pull-request", 1, {
    number: 1,
    push: 1,
    runId: "early",
    revision: 0,
    result: "checks-failed",
    passed: 0,
    total,
  });
  const push = observation("observation.workspace.pull-request", 2, {
    number: 1,
    push: 2,
    runId: "late",
    revision: 1,
    result: "checks-passed",
    passed: total,
    total,
  });
  const result = observation("observation.workspace.run", 2, {
    runId: "late",
    purpose: "pull-request",
    status: "result",
    outcome: outcome(total),
  });
  const data = JSON.parse(result.payload);
  data.occurredAt = new Date(
    new Date(data.occurredAt).getTime() + 1,
  ).toISOString();
  const lateResult = { ...result, payload: JSON.stringify(data) };
  const unrelated = observation("observation.workspace.run", 3, {
    runId: "other",
    purpose: "local",
    status: "result",
    outcome: outcome(0),
  });
  const detail = pullRequestDetail(
    [first, push, lateResult, unrelated],
    "frequency-map",
    1,
    () => fixture.revision,
  )!;
  assert.deepEqual(detail.outcome, outcome(total));
  assert.equal(detail.stats.runs, 0);
});

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

test("a pull request closed without merging is closed, and merging wins over closing", () => {
  const close = (number: number) =>
    observation("observation.board.closed", 25, {
      issueKey: "PY-002",
      pullRequest: number,
      via: "pointer",
      nudged: true,
    });
  const withClose = [...records, close(1), close(2)];
  const pulls = allPullRequests(withClose);
  assert.deepEqual(
    pulls.map((p) => [p.number, p.state]),
    [
      [2, "merged"],
      [1, "closed"],
    ],
  );
  assert.equal(pulls[1].closedAt, new Date(Date.UTC(2026, 9, 24, 9, 25)).toISOString());
  assert.deepEqual([...closedPullRequests(withClose, "frequency-map")], [1, 2]);
  const detail = pullRequestDetail(withClose, "frequency-map", 1, (id) =>
    id === fixture.id ? fixture.revision : undefined,
  )!;
  assert.equal(detail.timeline.at(-1)?.kind, "closed");
});

test("a pull request's timeline starts after the previous one and folds edits together", () => {
  const detail = pullRequestDetail(records, "frequency-map", 2, (id) =>
    id === fixture.id ? fixture.revision : undefined,
  )!;
  assert.equal(detail.previous?.number, 1);
  assert.deepEqual(
    detail.timeline.map((e) => e.kind),
    ["edits", "run", "pull-request", "checks", "merged"],
  );
  // A local run is scored on the visible cases only; CI runs them all.
  const visible = cases.filter((c) => c.visible).length;
  const run = detail.timeline[1] as { passed: number; total: number; tested: boolean };
  assert.deepEqual([run.passed, run.total, run.tested], [visible, visible, true]);
  assert.equal(detail.stats.edits, 1);
  assert.equal(detail.stats.runs, 1);
  assert.equal(detail.stats.firstGreenAt, detail.timeline[1].at);
  assert.deepEqual(detail.code, {
    [fixture.path]: {
      text: "def frequency_map(words):\n    return {}\n",
      truncated: false,
    },
  });
  assert.equal((detail.outcome as { status: string }).status, "completed");
});

test("the first pull request includes opening the IDE, and missing code is null", () => {
  const detail = pullRequestDetail(records, "frequency-map", 1, (id) =>
    id === fixture.id ? fixture.revision : undefined,
  )!;
  assert.deepEqual(
    detail.timeline.map((e) => e.kind),
    ["opened", "edits", "run", "pull-request", "checks"],
  );
  assert.equal(detail.stats.edits, 2);
  assert.equal(detail.stats.firstGreenAt, undefined);
  assert.equal(detail.code, null);
  assert.equal(
    pullRequestDetail(records, "frequency-map", 9, (id) =>
      id === fixture.id ? fixture.revision : undefined,
    ),
    null,
  );
});

test("line diffs keep unchanged lines and number both sides", () => {
  const lines = diffLines("a\nb\nc\n", "a\nB\nc\nd\n");
  assert.deepEqual(
    lines.map((l) => `${l.kind}:${l.text}`),
    ["same:a", "del:b", "add:B", "same:c", "add:d"],
  );
  assert.deepEqual(diffStats(lines), { added: 2, removed: 1 });
  const [hunk] = hunks(lines);
  assert.deepEqual(
    [hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines],
    [1, 3, 1, 4],
  );
});

test("distant changes become separate hunks", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  const after = before
    .replace("line 1\n", "line one\n")
    .replace("line 18", "line eighteen");
  assert.equal(hunks(diffLines(before, after)).length, 2);
  assert.deepEqual(hunks(diffLines("same\n", "same\n")), []);
});

test("durations read like a person would say them", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString();
  assert.equal(duration(at(0), at(0)), "under a minute");
  assert.equal(duration(at(0), at(42)), "42m");
  assert.equal(duration(at(0), at(125)), "2h 5m");
});

test("work continues on an open pull request: each push is checked under the same number", () => {
  const pushes: WorkspaceRecord[] = [
    observation("observation.workspace.run", 40, {
      runId: "a1",
      purpose: "pull-request",
      status: "queued",
    }),
    observation("observation.workspace.pull-request", 41, {
      number: 1,
      push: 1,
      runId: "a1",
      revision: 1,
      codeArtifactId: "a.code.1",
      result: "checks-failed",
      passed: 1,
      total,
    }),
    observation("observation.workspace.edit", 45, {}),
    observation("observation.workspace.run", 50, {
      runId: "a2",
      purpose: "pull-request",
      status: "queued",
    }),
    observation("observation.workspace.pull-request", 51, {
      number: 1,
      push: 2,
      runId: "a2",
      revision: 2,
      codeArtifactId: "a.code.2",
      result: "checks-passed",
      passed: total,
      total,
    }),
  ];
  const [pull] = allPullRequests(pushes);
  assert.deepEqual(
    [pull.number, pull.pushes, pull.result, pull.runId, pull.state],
    [1, 2, "checks-passed", "a2", "open"],
  );
  assert.ok(pull.openedAt < pull.at);
  const detail = pullRequestDetail(pushes, "frequency-map", 1, (id) =>
    id === fixture.id ? fixture.revision : undefined,
  )!;
  assert.deepEqual(
    detail.timeline.map((e) => e.kind),
    ["pull-request", "checks", "edits", "push", "checks"],
  );
});
