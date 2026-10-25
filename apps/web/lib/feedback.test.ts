import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { behaviourOf, due, feedbackOf, openBlocking, type Release } from "./feedback";
import { historical } from "./test-fixtures";

// Hints and teammate comments live on in the revisions before ENG-329; they are tested there.
const published = historical("frequency-map");
// The default rules, where a fixing push or a reply resolves a thread. PY-002's own findings need an
// explicit Resolve (see the incident tests), so these tests read its comments without it.
const fixture = {
  ...published,
  revision: {
    ...published.revision,
    team: published.revision.team.map(({ resolve: _, ...comment }) => comment),
  },
};
const cases = fixture.revision.checks.cases;
const revisionFor = (id: string) => (id === fixture.id ? fixture.revision : undefined);
const CLEAN = "def frequency_map(items):\n    counts = {}\n    for item in items:\n        counts[item] = counts.get(item, 0) + 1\n    return counts\n";
const DEBUG = CLEAN.replace("    return counts", "    print(counts)\n    return counts");

/** A recorded history for PY-002, built one step at a time. */
function history() {
  const records: WorkspaceRecord[] = [];
  let sequence = 0;
  let minute = 0;
  const at = () => new Date(Date.UTC(2026, 9, 24, 9, minute)).toISOString();
  const observe = (type: string, data: Record<string, unknown>, issue = "frequency-map") => {
    sequence += 1;
    records.push({
      recordId: `s.${sequence}`,
      kind: "observation",
      participantId: "p",
      payload: JSON.stringify({
        type,
        occurredAt: at(),
        source: { id: "s", sequence },
        issue,
        issueRevision: fixture.id,
        data,
      }),
    });
  };
  const outcome = (passing: number) => ({
    status: "completed",
    phase: "tests",
    cases: cases.map(({ expected }, index) => ({
      index,
      output: { text: JSON.stringify(index < passing ? expected : "wrong"), truncated: false },
    })),
  });
  let pushes = 0;
  return {
    records,
    wait(minutes: number) {
      minute += minutes;
    },
    edit() {
      observe("observation.workspace.edit", {});
    },
    run(passing: number) {
      observe("observation.workspace.run", {
        runId: `r${sequence}`,
        purpose: "local",
        status: "result",
        outcome: outcome(passing),
      });
    },
    push(number: number, push: number, text: string, passing: number) {
      const runId = `p${++pushes}`;
      const artifact = `s.code.${pushes}`;
      records.push({
        recordId: artifact,
        kind: "artifact",
        participantId: "p",
        payload: JSON.stringify({ files: { [fixture.path]: { text } } }),
      });
      observe("observation.workspace.run", {
        runId,
        purpose: "pull-request",
        status: "result",
        outcome: outcome(passing),
      });
      observe("observation.workspace.pull-request", {
        number,
        push,
        runId,
        codeArtifactId: artifact,
        result: passing === cases.length ? "checks-passed" : "checks-failed",
      });
      return { number, push };
    },
    /** Records releases the way the IDE's session does. */
    release(releases: Release[]) {
      for (const r of releases)
        if (r.kind === "comment")
          observe("observation.workspace.comment", {
            comment: r.comment.id,
            where: r.comment.where,
            severity: r.comment.severity,
            wording: r.wording,
            ...(r.pullRequest ? { pullRequest: r.pullRequest, push: r.push } : {}),
          });
        else if (r.kind === "hint")
          observe("observation.workspace.hint", { hint: r.hint.id, level: r.hint.level });
        else
          observe("observation.workspace.thread-resolved", {
            comment: r.comment,
            pullRequest: r.pullRequest,
            push: r.push,
            by: "code",
          });
    },
    reply(number: number, comment: string, text: string) {
      observe("observation.board.replied", { issueKey: "PY-002", pullRequest: number, comment, text });
    },
    due(files: string, push?: { number: number; push: number }) {
      return due({
        revision: fixture.revision,
        records,
        issue: "frequency-map",
        participantId: "p",
        revisionFor,
        files: { [fixture.path]: files },
        push,
      });
    },
  };
}

const ids = (releases: Release[]) =>
  releases.map((r) =>
    r.kind === "hint" ? `hint:${r.hint.id}` : r.kind === "resolved" ? `resolved:${r.comment}` : r.comment.id,
  );

test("a blocking review comment holds the merge until a push no longer triggers it", () => {
  const h = history();
  const first = h.push(1, 1, DEBUG, 3);
  const review = h.due(DEBUG, first);
  assert.deepEqual(ids(review), ["priya-debug-print"]);
  h.release(review);
  assert.equal(openBlocking(feedbackOf(h.records, "frequency-map"), 1).length, 1);
  // Nothing new on a check without a push, and the same push does not fire it twice.
  assert.deepEqual(ids(h.due(DEBUG)), []);
  assert.deepEqual(ids(h.due(DEBUG, first)), []);

  h.wait(3);
  const second = h.push(1, 2, CLEAN, cases.length);
  const next = h.due(CLEAN, second);
  assert.deepEqual(ids(next), ["resolved:priya-debug-print"]);
  h.release(next);
  const feedback = feedbackOf(h.records, "frequency-map");
  assert.equal(openBlocking(feedback, 1).length, 0);
  assert.deepEqual(feedback.threads.map((t) => [t.comment, t.push, t.resolved?.by]), [
    ["priya-debug-print", 1, "code"],
  ]);

  // repeat: while-true: the print coming back opens the thread again.
  h.wait(1);
  const third = h.push(1, 3, DEBUG, cases.length);
  assert.deepEqual(ids(h.due(DEBUG, third)), ["priya-debug-print"]);
});

test("a reply resolves a blocking thread; review comments are per pull request", () => {
  const h = history();
  const first = h.push(1, 1, DEBUG, cases.length);
  h.release(h.due(DEBUG, first));
  h.reply(1, "priya-debug-print", "It's the scanner's own logger, not stdout.");
  const feedback = feedbackOf(h.records, "frequency-map");
  assert.equal(openBlocking(feedback, 1).length, 0);
  assert.deepEqual(feedback.threads[0].resolved?.by, "reply");
  assert.equal(feedback.threads[0].replies[0].text, "It's the scanner's own logger, not stdout.");
  // A second pull request is reviewed afresh.
  const other = h.push(2, 1, DEBUG, cases.length);
  assert.deepEqual(ids(h.due(DEBUG, other)), ["priya-debug-print"]);
});

test("hints come one at a time, in order, on behaviour without progress", () => {
  const h = history();
  h.run(1); // progress: one case passes
  for (let i = 0; i < 9; i++) {
    h.wait(1);
    h.edit();
  }
  assert.equal(behaviourOf(h.records, "frequency-map", revisionFor).activeMinutesWithoutProgress, 9);
  assert.deepEqual(ids(h.due(CLEAN)), []);
  // Edits within the same minute count once; a long break counts nothing.
  h.edit();
  h.wait(90);
  h.edit();
  h.push(1, 1, CLEAN, 1);
  h.wait(1);
  h.push(1, 2, CLEAN, 1);
  const behaviour = behaviourOf(h.records, "frequency-map", revisionFor);
  assert.deepEqual(behaviour, {
    activeMinutesWithoutProgress: 11,
    runsWithoutProgress: 0,
    failingPushes: 2,
  });
  // Both hints' triggers hold, but only the first is released.
  const first = h.due(CLEAN);
  assert.deepEqual(ids(first), ["hint:hint-1"]);
  h.release(first);
  assert.deepEqual(ids(h.due(CLEAN)), ["hint:hint-2"]);
  // Progress resets the clock.
  h.run(2);
  assert.equal(behaviourOf(h.records, "frequency-map", revisionFor).activeMinutesWithoutProgress, 0);
});
