import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptAt, attemptRecords } from "./attempts";
import { due, feedbackOf, investigationOf } from "./feedback";
import {
  attemptLabel,
  incidentState,
  incidentTimeline,
  resolveVersion,
  shortVersion,
} from "./incident";
import { allPullRequests } from "./pulls";
import {
  decodeResult,
  encodeResult,
  incidentSentence,
  incidentTime,
  type Result,
} from "./result";
import { catalog, live } from "./test-fixtures";

const ISSUE = "checkout-guest-shipping";
const fixture = live(ISSUE);
const cases = fixture.revision.checks.cases;
const revisionFor = (id: string) => catalog.revisions[id];
const LOG = "logs/checkout-api.log";
const FIX = fixture.starter.replace(
  `const member = order.customer.loyalty.tier !== "none";`,
  `const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
);

/** A recorded response to INC-1, one step at a time, a minute apart. */
function incident() {
  const records: WorkspaceRecord[] = [];
  let sequence = 0;
  let minute = 0;
  let pushes = 0;
  const now = () => new Date(Date.UTC(2026, 9, 24, 2, minute)).toISOString();
  const observe = (
    type: string,
    data: Record<string, unknown>,
    revision: string = fixture.id,
  ) => {
    sequence += 1;
    minute += 1;
    records.push({
      recordId: `s.${sequence}`,
      kind: "observation",
      participantId: "p",
      payload: JSON.stringify({
        type,
        occurredAt: now(),
        source: { id: "s", sequence },
        issue: ISSUE,
        issueRevision: revision,
        data,
      }),
    });
    return now();
  };
  /** A finished run of these cases, each passing or not. */
  const outcome = (run: typeof cases, pass: (index: number) => boolean) => ({
    status: "completed",
    phase: "tests",
    cases: run.map(({ expected }, index) => ({
      index,
      output: {
        text: JSON.stringify(pass(index) ? expected : "wrong"),
        truncated: false,
      },
    })),
  });
  const visible = cases.filter((c) => c.visible);
  return {
    records,
    now,
    wait(minutes: number) {
      minute += minutes;
    },
    start(revision = fixture.id) {
      return observe(
        "observation.board.moved",
        {
          issueKey: "INC-1",
          from: "todo",
          to: "in-progress",
          trigger: "start-work",
        },
        revision,
      );
    },
    replay(revision = fixture.id) {
      return observe(
        "observation.board.moved",
        {
          issueKey: "INC-1",
          from: "done",
          to: "in-progress",
          trigger: "replay",
        },
        revision,
      );
    },
    view(path: string) {
      observe("observation.board.viewed", { path, query: "", previous: null });
    },
    open() {
      observe("observation.workspace.opened", {});
    },
    openFile(path: string, via = "pointer") {
      observe("observation.workspace.navigated", {
        target: "file",
        action: "show",
        value: path,
        via,
      });
    },
    /** A local run of the visible cases; `regression` is whether case-2 passes. */
    run(regression: boolean) {
      observe("observation.workspace.run", {
        runId: `local-${sequence}`,
        purpose: "local",
        status: "result",
        outcome: outcome(visible, (i) => i !== 1 || regression),
      });
    },
    push(number: number, push: number, passing: boolean, text = FIX) {
      const runId = `ci-${++pushes}`;
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
        outcome: outcome(cases, (i) => passing || i !== 1),
      });
      observe("observation.workspace.pull-request", {
        number,
        push,
        runId,
        codeArtifactId: artifact,
        result: passing ? "checks-passed" : "checks-failed",
        passed: passing ? cases.length : cases.length - 1,
        total: cases.length,
      });
      return runId;
    },
    merge(number: number, runId: string) {
      return observe("observation.board.moved", {
        issueKey: "INC-1",
        from: "in-progress",
        to: "done",
        trigger: "pull-request-merged",
        pullRequest: number,
        runId,
      });
    },
    deploy(number: number, runId: string) {
      return observe("observation.board.deployed", {
        issueKey: "INC-1",
        pullRequest: number,
        runId,
        via: "pointer",
      });
    },
    close(number: number) {
      return observe("observation.board.closed", {
        issueKey: "INC-1",
        pullRequest: number,
        via: "pointer",
        nudged: false,
      });
    },
    comment(id: string) {
      observe("observation.workspace.comment", {
        where: "issue",
        comment: id,
        wording: 0,
      });
    },
  };
}

/** What the IDE would release now, from the latest attempt's records. */
function released(
  records: readonly WorkspaceRecord[],
  files = { [fixture.path]: fixture.starter },
) {
  return due({
    revision: fixture.revision,
    records: attemptRecords(records, ISSUE),
    issue: ISSUE,
    participantId: "p",
    revisionFor,
    files,
  }).map((r) =>
    r.kind === "comment"
      ? r.comment.id
      : r.kind === "hint"
        ? r.hint.id
        : r.comment,
  );
}

test("the incident's version resolves to exactly one published revision, never the latest by default", () => {
  const ids = Object.keys(catalog.revisions);
  assert.equal(resolveVersion(ids, shortVersion(fixture.id)), fixture.id);
  assert.equal(resolveVersion(ids, fixture.id), fixture.id);
  assert.equal(
    resolveVersion(ids, shortVersion(fixture.id).toUpperCase()),
    fixture.id,
  );
  assert.equal(resolveVersion(ids, "deadbeef"), null);
  assert.equal(resolveVersion(ids, "81a9"), null, "too short to name one");
  assert.equal(resolveVersion(ids, "../etc"), null);
  assert.equal(resolveVersion(ids, null), null);
  // An older published revision of any issue stays resolvable: the catalog keeps them all.
  const older = Object.keys(catalog.revisions).find((id) => id !== fixture.id)!;
  assert.equal(resolveVersion(ids, shortVersion(older)), older);
});

test("visiting the incident, its pull request or its report files nothing", () => {
  const play = incident();
  play.view("/incident");
  play.view("/pulls/INC-1/1");
  play.view("/incident/report");
  const state = incidentState(play.records);
  assert.equal(state.merged, null);
  assert.equal(state.deployed, null);
  assert.equal(state.attempt.number, 1);
});

test("a merge counts only when the merged push passed every check, and a deploy only for that push", () => {
  const play = incident();
  play.start();
  play.open();
  const failing = play.push(1, 1, false);
  // A merge record naming a push whose checks failed is not a merged fix.
  play.merge(1, failing);
  play.deploy(1, failing);
  assert.equal(incidentState(play.records).merged, null);
  assert.equal(incidentState(play.records).deployed, null);

  const again = incident();
  again.start();
  const first = again.push(1, 1, false);
  const current = again.push(1, 2, true);
  again.merge(1, current);
  let state = incidentState(again.records);
  assert.equal(
    state.merged?.runId,
    current,
    "the current push, not the stale one",
  );
  assert.equal(state.merged?.passed, cases.length);
  assert.equal(state.deployed, null, "merged is not deployed");
  // A deploy naming the earlier, failing push or another pull request does not count.
  again.deploy(1, first);
  again.deploy(2, current);
  assert.equal(incidentState(again.records).deployed, null);
  // A later failing local run doesn't undo a merged, passing push.
  again.run(false);
  again.deploy(1, current);
  state = incidentState(again.records);
  assert.equal(state.deployed?.number, 1);
  assert.equal(state.deployed?.runId, current);
});

test("a replay starts fresh: an earlier merge and deploy never satisfy it, and nothing earlier is lost", () => {
  const play = incident();
  const begun = play.start();
  const run = play.push(1, 1, true);
  play.merge(1, run);
  const deployedAt = play.deploy(1, run);
  // Work after merging, never pushed: it stays with the first attempt.
  play.push(2, 1, false, "// tinkering after the merge\n");
  const before = play.records.length;
  play.replay();
  assert.equal(play.records.length, before + 1, "a replay only adds");

  const state = incidentState(play.records);
  assert.equal(state.attempt.number, 2);
  assert.equal(attemptLabel(state.attempt.number), "Replay 1");
  assert.equal(state.merged, null);
  assert.equal(state.deployed, null);
  assert.equal(state.revision, fixture.id);
  // The first attempt is still on record, deployed.
  const first = incidentState(play.records, deployedAt);
  assert.equal(first.attempt.number, 1);
  assert.equal(first.deployed?.number, 1);
  assert.equal(attemptAt(play.records, ISSUE, begun).number, 1);
  // The replay's own pull request (#3) can be merged; #2, opened after #1 merged, cannot.
  const replayRun = play.push(3, 1, true);
  const pulls = allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls.find((p) => p.number === 2)?.otherMerged, 1);
  assert.equal(pulls.find((p) => p.number === 3)?.otherMerged, undefined);
  play.merge(3, replayRun);
  play.deploy(3, replayRun);
  assert.equal(incidentState(play.records).deployed?.number, 3);
});

test("a replay names the revision it plays, and stays on it", () => {
  const play = incident();
  play.start();
  play.merge(1, play.push(1, 1, true));
  const older = "sha256:" + "0".repeat(64);
  play.replay(older);
  assert.equal(incidentState(play.records).revision, older);
});

test("teammates answer actions, never the clock, and a replay hears them again", () => {
  const play = incident();
  play.start();
  play.open();
  // The IDE opening its own tabs is not the person investigating.
  play.openFile(LOG, "app");
  assert.deepEqual(released(play.records), []);
  // Half an hour of nothing releases nothing.
  play.wait(30);
  assert.deepEqual(released(play.records), []);

  play.openFile(LOG);
  assert.deepEqual(investigationOf(play.records, ISSUE, revisionFor).opened, [
    LOG,
  ]);
  assert.deepEqual(released(play.records), ["kai-flag"]);
  play.comment("kai-flag");

  play.run(false);
  assert.deepEqual(released(play.records), ["tomasz-reproduced"]);
  play.comment("tomasz-reproduced");
  assert.deepEqual(released(play.records), [], "released once");

  play.run(true);
  assert.deepEqual(released(play.records, { [fixture.path]: FIX }), [
    "noor-green",
  ]);
  play.comment("noor-green");

  play.merge(1, play.push(1, 1, true));
  play.replay();
  // A new attempt: nothing released yet, and the log has to be opened again.
  assert.deepEqual(
    feedbackOf(attemptRecords(play.records, ISSUE), ISSUE).released,
    [],
  );
  assert.deepEqual(released(play.records), []);
  play.openFile(LOG);
  assert.deepEqual(released(play.records), ["kai-flag"]);
});

test("hints come from runs and pushes without progress, not time", () => {
  const play = incident();
  play.start();
  play.run(false); // the first run is progress over nothing
  play.wait(60);
  assert.deepEqual(released(play.records), ["tomasz-reproduced"]);
  play.comment("tomasz-reproduced");
  play.run(false);
  play.run(false);
  assert.deepEqual(released(play.records), ["hint-1"]);
});

test("the timeline lists what this attempt did, in order", () => {
  const play = incident();
  play.start();
  play.open();
  play.openFile(LOG);
  play.run(false);
  play.run(true);
  const run = play.push(1, 1, true);
  play.merge(1, run);
  play.deploy(1, run);
  assert.deepEqual(
    incidentTimeline(play.records, revisionFor).map((m) => m.label),
    [
      "Acknowledged the page",
      "Opened the IDE",
      "Read the logs",
      "Reproduced it with the tests",
      "Tests green locally",
      "Opened the pull request",
      "Merged the fix",
      "Deployed to production",
    ],
  );
  play.replay();
  assert.deepEqual(
    incidentTimeline(play.records, revisionFor).map((m) => m.label),
    ["Acknowledged the page"],
  );
});

test("a merge is never mistaken for acknowledging the page", () => {
  const play = incident();
  play.open();
  const run = play.push(1, 1, true);
  play.merge(1, run);
  const labels = incidentTimeline(play.records, revisionFor).map(
    (m) => m.label,
  );
  assert.equal(labels.includes("Acknowledged the page"), false);
  assert.equal(labels.includes("Merged the fix"), true);
});

test("a shared incident card carries its version and attempt; bad ones are dropped", () => {
  const card: Result = {
    v: 2,
    k: "INC-1",
    l: "javascript",
    c: "abc123def456",
    t: 412,
    rd: 40,
    ks: 300,
    ty: 4,
    w: 50,
    r: 3,
    g: 2,
    p: 1,
    h: 0,
    ps: 0,
    lt: 0,
    iv: shortVersion(fixture.id),
    a: 2,
    e: 257,
  };
  assert.deepEqual(decodeResult(encodeResult(card)), card);
  const decoded = decodeResult(
    encodeResult({ ...card, iv: "nothex!!", a: 0 }),
  )!;
  assert.equal(decoded.iv, undefined);
  assert.equal(decoded.a, undefined);
  assert.equal(decoded.e, undefined);
  // The sentence states the simulation's rule and labels active time; it certifies nothing else.
  assert.equal(
    incidentSentence(card),
    "Production was down. AI was down. In a no-AI incident sim I restored checkout in 4 min 17 s (6 min 52 s active), on a replay.",
  );
  assert.equal(incidentTime({ ...card, e: undefined }), "6 min 52 s active");
});

test("progress saved before replays existed reads exactly as it did", () => {
  // Board 6.0.0-era history: start, a merged pull request, a later one blocked by it.
  const play = incident();
  play.start();
  play.merge(1, play.push(1, 1, true));
  play.push(2, 1, true);
  const records = play.records;
  assert.deepEqual(
    attemptRecords(records, ISSUE),
    records,
    "no replay, nothing narrowed",
  );
  assert.equal(attemptAt(records, ISSUE).number, 1);
  const pulls = allPullRequests(records);
  assert.equal(pulls.find((p) => p.number === 1)?.state, "merged");
  assert.equal(
    pulls.find((p) => p.number === 2)?.otherMerged,
    1,
    "Done still stays done",
  );
});

test("closed pull requests and replays: only the attempt's own merged, passing push ships", () => {
  const play = incident();
  play.start();
  // First response: a failing pull request closed unmerged, then a new one merged and deployed.
  play.push(1, 1, false);
  play.close(1);
  const first = play.push(2, 1, true);
  play.merge(2, first);
  play.deploy(2, first);
  assert.equal(incidentState(play.records).deployed?.number, 2);
  // A pull request closed unmerged is not a merged fix.
  const closed = incident();
  closed.start();
  const run = closed.push(1, 1, true);
  closed.close(1);
  assert.equal(incidentState(closed.records).merged, null);
  assert.equal(allPullRequests(closed.records).find((p) => p.number === 1)?.state, "closed");

  // Replay: a pull request closed in the replay, then its own merged fix.
  play.replay();
  assert.equal(incidentState(play.records).deployed, null, "the first deploy does not count");
  play.push(3, 1, false);
  play.close(3);
  const replayRun = play.push(4, 1, true);
  const pulls = allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls.find((p) => p.number === 1)?.state, "closed");
  assert.equal(pulls.find((p) => p.number === 2)?.state, "merged");
  assert.equal(pulls.find((p) => p.number === 3)?.state, "closed");
  assert.equal(pulls.find((p) => p.number === 4)?.otherMerged, undefined, "#2 was another attempt");
  play.merge(4, replayRun);
  assert.equal(incidentState(play.records).deployed, null, "merged is not deployed");
  play.deploy(4, replayRun);
  const state = incidentState(play.records);
  assert.equal(state.attempt.number, 2);
  assert.equal(state.deployed?.number, 4);
  void run;
});
