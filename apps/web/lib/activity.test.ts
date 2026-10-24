import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import {
  actionsPerDay,
  activeDays,
  challengeIdOf,
  dayOf,
  greeting,
  heatmap,
  pullRequestHistory,
  recentActivity,
  timeAgo,
} from "./activity";

const record = (payload: object): WorkspaceRecord => ({
  recordId: Math.random().toString(36),
  kind: "observation",
  participantId: "p",
  payload: JSON.stringify(payload),
});

const records: WorkspaceRecord[] = [
  record({
    type: "observation.board.moved",
    occurredAt: "2026-10-24T09:00:00.000Z",
    challengeArtifactId: "challenge.reset-link-expiry.1.0.0",
    data: { issueKey: "API-2", from: "backlog", to: "todo" },
  }),
  record({
    type: "observation.workspace.opened",
    occurredAt: "2026-10-23T09:00:00.000Z",
    challengeArtifactId: "challenge.frequency-map.2.1.0",
    data: {},
  }),
  record({
    type: "observation.workspace.edit",
    occurredAt: "2026-10-23T09:01:00.000Z",
    challengeArtifactId: "challenge.frequency-map.2.1.0",
    data: {},
  }),
  record({
    type: "observation.workspace.run",
    occurredAt: "2026-10-23T09:02:00.000Z",
    challengeArtifactId: "challenge.frequency-map.2.1.0",
    data: { status: "started" },
  }),
  record({
    type: "observation.workspace.run",
    occurredAt: "2026-10-23T09:03:00.000Z",
    challengeArtifactId: "challenge.frequency-map.2.1.0",
    data: { status: "result" },
  }),
  { recordId: "a", kind: "artifact", participantId: "p", payload: "{}" },
  { recordId: "b", kind: "observation", participantId: "p", payload: "nope" },
];

test("the feed lists moves, opens and finished runs, newest first", () => {
  assert.deepEqual(
    recentActivity(records).map((e) => e.kind),
    ["moved", "ran", "opened"],
  );
  assert.deepEqual(recentActivity(records)[0], {
    kind: "moved",
    at: "2026-10-24T09:00:00.000Z",
    key: "API-2",
    from: "backlog",
    to: "todo",
  });
  assert.equal(recentActivity(records, 1).length, 1);
  assert.equal(challengeIdOf("challenge.frequency-map.2.1.0"), "frequency-map");
  assert.equal(challengeIdOf("artifact.x"), null);
});

test("every observation counts towards its local day", () => {
  const days = actionsPerDay(records);
  const total = [...days.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, 5);
  const today = new Date("2026-10-24T15:00:00");
  assert.equal(activeDays(days, today), days.size);
  assert.equal(activeDays(new Map(), today), 0);
});

test("the heatmap is whole weeks, Monday first, ending this week", () => {
  // 24 Oct 2026 is a Saturday.
  const today = new Date(2026, 9, 24, 15);
  const counts = new Map([
    [dayOf(today), 4],
    ["2026-10-19", 40],
  ]);
  const grid = heatmap(counts, today, 2);
  assert.equal(grid.length, 2);
  assert.ok(grid.every((week) => week.length === 7));
  assert.equal(grid[0][0].day, "2026-10-12");
  assert.equal(grid[1][0].day, "2026-10-19");
  assert.equal(grid[1][0].level, 4);
  assert.equal(grid[1][5].level, 2);
  assert.equal(grid[1][6].future, true);
  assert.equal(grid[1][5].future, false);
});

test("times read like a feed", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  assert.equal(timeAgo("2026-10-24T11:59:30.000Z", now), "just now");
  assert.equal(timeAgo("2026-10-24T11:15:00.000Z", now), "45m ago");
  assert.equal(timeAgo("2026-10-24T07:00:00.000Z", now), "5h ago");
  assert.equal(timeAgo("2026-10-23T10:00:00.000Z", now), "yesterday");
  assert.equal(timeAgo("2026-10-20T10:00:00.000Z", now), "4d ago");
  assert.equal(greeting(new Date(2026, 9, 24, 9)), "Good morning");
  assert.equal(greeting(new Date(2026, 9, 24, 2)), "Burning the midnight oil");
});

test("pull requests read back per person and Challenge, newest first", () => {
  const pr = (
    participantId: string,
    id: string,
    number: number,
    result: string,
  ) =>
    record({
      type: "observation.workspace.pull-request",
      participantId,
      occurredAt: `2026-10-24T10:0${number}:00.000Z`,
      challengeArtifactId: `challenge.${id}.2.1.0`,
      data: {
        number,
        runId: `run-${number}`,
        revision: number * 4,
        result,
        passed: 3,
        total: 4,
      },
    });
  const prs = [
    pr("p", "frequency-map", 1, "checks-failed"),
    pr("p", "frequency-map", 2, "merged"),
    pr("q", "frequency-map", 9, "merged"),
    pr("p", "dedupe", 3, "merged"),
  ];
  assert.deepEqual(
    pullRequestHistory(prs, "p", "frequency-map").map((p) => [
      p.number,
      p.result,
    ]),
    [
      [2, "merged"],
      [1, "checks-failed"],
    ],
  );
  // The feed shows pull requests, and their checks are not repeated as runs.
  const feed = recentActivity([
    ...prs.slice(0, 1),
    record({
      type: "observation.workspace.run",
      occurredAt: "2026-10-24T10:01:00.000Z",
      challengeArtifactId: "challenge.frequency-map.2.1.0",
      data: { status: "result", purpose: "pull-request" },
    }),
  ]);
  assert.deepEqual(
    feed.map((e) => e.kind),
    ["pull-request"],
  );
});
