import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptAt, attemptRecords } from "./attempts";
import {
  due,
  feedbackOf,
  mergeBlocker,
  openBlocking,
  openRequired,
  type Release,
} from "./feedback";
import { chatOf } from "./chat";
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
    /** The person resolving a review finding themselves (Resolve). */
    resolve(number: number, comment: string) {
      return observe("observation.board.resolved", {
        issueKey: "INC-1",
        pullRequest: number,
        comment,
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
    /** A review comment released on a push, as the IDE records it. */
    review(number: number, push: number, id: string, severity = "blocking") {
      observe("observation.workspace.comment", {
        where: "review",
        comment: id,
        severity,
        wording: 0,
        pullRequest: number,
        push,
      });
    },
    /** A review thread resolved by a push that no longer triggers it. */
    resolvedByCode(number: number, push: number, id: string) {
      observe("observation.workspace.thread-resolved", {
        comment: id,
        pullRequest: number,
        push,
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

const CATCH = fixture.starter.replace(
  `  const member = order.customer.loyalty.tier !== "none";`,
  `  let member = false;\n  try {\n    member = order.customer.loyalty.tier !== "none";\n  } catch (error) {\n    member = false;\n  }`,
);

/** The chat so far, by line id. */
const chat = (records: readonly WorkspaceRecord[]) =>
  chatOf(fixture.revision.chat ?? [], records, ISSUE, revisionFor).map(
    (m) => m.id,
  );

/** What review would release on a push whose checks just finished. */
function reviewed(
  records: readonly WorkspaceRecord[],
  number: number,
  push: number,
): Release[] {
  return due({
    revision: fixture.revision,
    records: attemptRecords(records, ISSUE),
    issue: ISSUE,
    participantId: "p",
    revisionFor,
    files: { [fixture.path]: fixture.starter },
    push: { number, push },
  });
}

test("the incident's version resolves to exactly one published revision; the replaced one is gone", () => {
  const ids = Object.keys(catalog.revisions);
  assert.equal(resolveVersion(ids, shortVersion(fixture.id)), fixture.id);
  assert.equal(resolveVersion(ids, fixture.id), fixture.id);
  // The first incident (81a951d5) was replaced outright: its links restart the current one.
  assert.equal(resolveVersion(ids, "81a951d5"), null);
  assert.equal(
    catalog.revisions[
      "sha256:81a951d5526042a635ed204fce8f4c3801e0494aa7e9fb7739a190e9b2c4b400"
    ],
    undefined,
  );
  assert.equal(resolveVersion(ids, "deadbeef"), null);
  assert.equal(
    resolveVersion(ids, shortVersion(fixture.id).slice(0, 4)),
    null,
    "too short",
  );
  assert.equal(resolveVersion(ids, "../etc"), null);
  assert.equal(resolveVersion(ids, null), null);
});

test("both files of the change are the player's, and the runner gets them", () => {
  const files = fixture.revision.workspace.files;
  assert.equal(files["src/checkout/quote.js"].role, "edit");
  assert.equal(files["src/checkout/shipping.js"].role, "edit");
  assert.equal(files["src/checkout/money.js"].role, "read");
  // No flag or rollback to look for: nothing in the repo or ticket mentions one.
  const text =
    Object.values(files)
      .map((f) => f.text)
      .join("\n") + fixture.revision.body;
  assert.doesNotMatch(text, /\bflag|rollout|roll back|rollback/i);
});

test("visiting the incident, its pull request or its report files nothing", () => {
  const play = incident();
  play.view("/incident");
  play.view("/pulls/INC-1/1");
  play.view("/incident/report");
  const state = incidentState(play.records);
  assert.equal(state.merged, null);
  assert.equal(state.attempt.number, 1);
});

test("the report needs a merge whose merged push passed every check, nothing more", () => {
  const play = incident();
  play.start();
  play.open();
  const failing = play.push(1, 1, false);
  // A merge record naming a push whose checks failed is not a resolved incident.
  play.merge(1, failing);
  assert.equal(incidentState(play.records).merged, null);

  const again = incident();
  again.start();
  again.push(1, 1, false);
  const current = again.push(1, 2, true);
  again.merge(1, current);
  const state = incidentState(again.records);
  assert.equal(
    state.merged?.runId,
    current,
    "the current push, not the stale one",
  );
  assert.equal(state.merged?.passed, cases.length);
  // A later failing local run doesn't undo a merged, passing push.
  again.run(false);
  assert.equal(incidentState(again.records).merged?.number, 1);
});

test("a replay starts fresh: an earlier merge never satisfies it, and nothing earlier is lost", () => {
  const play = incident();
  const begun = play.start();
  const run = play.push(1, 1, true);
  const mergedAt = play.merge(1, run);
  play.push(2, 1, false, "// tinkering after the merge\n");
  const before = play.records.length;
  play.replay();
  assert.equal(play.records.length, before + 1, "a replay only adds");
  const state = incidentState(play.records);
  assert.equal(state.attempt.number, 2);
  assert.equal(attemptLabel(state.attempt.number), "Replay 1");
  assert.equal(state.merged, null);
  assert.equal(
    incidentState(play.records, mergedAt).merged?.number,
    1,
    "the first is on record",
  );
  assert.equal(attemptAt(play.records, ISSUE, begun).number, 1);
  const replayRun = play.push(3, 1, true);
  const pulls = allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls.find((p) => p.number === 2)?.otherMerged, 1);
  assert.equal(pulls.find((p) => p.number === 3)?.otherMerged, undefined);
  play.merge(3, replayRun);
  assert.equal(incidentState(play.records).merged?.number, 3);
});

test("a replay names the revision it plays, and stays on it", () => {
  const play = incident();
  play.start();
  play.merge(1, play.push(1, 1, true));
  const older = "sha256:" + "0".repeat(64);
  play.replay(older);
  assert.equal(incidentState(play.records).revision, older);
});

test("the ticket's clues are there from the start; nothing is released into the issue thread", () => {
  const opened = fixture.revision.team.filter((c) => c.where === "issue");
  assert.ok(opened.length >= 3);
  assert.ok(
    opened.every((c) => "event" in c.when && c.when.event === "opened"),
  );
  assert.ok(
    fixture.revision.team
      .filter((c) => c.where === "review")
      .every((c) => c.severity !== "info"),
    "the pull request only gets actionable findings",
  );
  const play = incident();
  play.start();
  play.open();
  play.openFile(LOG);
  play.run(false);
  play.run(true);
  play.wait(60);
  assert.deepEqual(
    released(play.records, { [fixture.path]: FIX }),
    [],
    "no issue comment is released",
  );
});

test("INC-1 has no team chat any more: no action releases a line", () => {
  const play = incident();
  play.start();
  play.openFile(LOG);
  play.run(false);
  play.run(true);
  const run = play.push(1, 1, true);
  play.merge(1, run);
  assert.deepEqual(chat(play.records), []);
});

test("hints come from runs and pushes without progress, not time", () => {
  const play = incident();
  play.start();
  play.run(false);
  play.wait(60);
  assert.deepEqual(released(play.records), []);
  play.run(false);
  play.run(false);
  assert.deepEqual(released(play.records), ["hint-1"]);
});

test("an explicit finding stays open through a fixing push until Resolve; CI stays its own gate", () => {
  const play = incident();
  play.start();
  const fb = () => feedbackOf(attemptRecords(play.records, ISSUE), ISSUE, revisionFor);
  const open = () => openRequired(fb(), 1, revisionFor).map((t) => t.comment).sort();
  const pullOne = () => allPullRequests(play.records).find((p) => p.number === 1)!;
  const blocker = () => mergeBlocker(pullOne(), openRequired(fb(), 1, revisionFor).length);
  const ids = (releases: Release[]) =>
    releases.map((r) => (r.kind === "comment" ? r.comment.id : `${r.kind}:${"comment" in r ? r.comment : ""}`));

  // Push 1 hides the crash with a catch, and CI fails: a review finding and a CI finding.
  play.push(1, 1, false, CATCH);
  assert.deepEqual(ids(reviewed(play.records, 1, 1)), ["catch-hides-guests"]);
  play.review(1, 1, "catch-hides-guests");
  assert.deepEqual(open(), ["catch-hides-guests", "ci-push-1"]);
  assert.equal(blocker(), "checks", "CI is checked first and on its own");

  // Push 2 is a valid correction and CI passes. Neither finding is resolved for the person.
  play.push(1, 2, true, FIX);
  assert.deepEqual(ids(reviewed(play.records, 1, 2)), [], "no automatic resolution, no new thread");
  assert.deepEqual(open(), ["catch-hides-guests", "ci-push-1"]);
  assert.equal(blocker(), "review", "green CI alone does not merge past open findings");
  // Nor does a code-resolution record from elsewhere.
  play.resolvedByCode(1, 2, "catch-hides-guests");
  assert.equal(blocker(), "review");

  // Resolving one leaves the other; resolving both, with the current push green, allows it.
  play.resolve(1, "catch-hides-guests");
  assert.deepEqual(open(), ["ci-push-1"]);
  assert.equal(blocker(), "review");
  play.resolve(1, "ci-push-1");
  assert.equal(blocker(), null);

  // If the current push fails, Resolve does not help: CI blocks, and a new CI finding opens.
  play.push(1, 3, false, FIX);
  assert.deepEqual(open(), ["ci-push-3"]);
  assert.equal(blocker(), "checks");
  // A push that brings the catch back reopens the review finding after it was resolved.
  play.push(1, 4, true, CATCH);
  assert.deepEqual(ids(reviewed(play.records, 1, 4)), ["catch-hides-guests"]);
  play.review(1, 4, "catch-hides-guests");
  assert.deepEqual(open(), ["catch-hides-guests", "ci-push-3"]);
  assert.equal(blocker(), "review");
});

test("a CI failure is a finding only Resolve clears; Resolve never makes failing CI mergeable", () => {
  const play = incident();
  play.start();
  const fb = () => feedbackOf(attemptRecords(play.records, ISSUE), ISSUE, revisionFor);
  const open = () => openRequired(fb(), 1, revisionFor).map((t) => t.comment);
  const blocker = () =>
    mergeBlocker(allPullRequests(play.records).find((p) => p.number === 1)!, open().length);

  play.push(1, 1, false);
  assert.deepEqual(open(), ["ci-push-1"], "a failing push opens a CI finding");
  // Acknowledged while CI is still red: resolved, and still not mergeable.
  play.resolve(1, "ci-push-1");
  assert.deepEqual(open(), []);
  assert.equal(blocker(), "checks");
  // Another failing push: the finding recurs as a new one, not twice for one failure.
  play.push(1, 2, false);
  play.push(1, 3, false);
  assert.deepEqual(open(), ["ci-push-2"]);
  // A valid later push: CI passes, and the open finding still needs Resolve.
  play.push(1, 4, true);
  assert.deepEqual(open(), ["ci-push-2"]);
  assert.equal(blocker(), "review");
  play.resolve(1, "ci-push-2");
  assert.equal(blocker(), null);
  // An ordinary green pull request has nothing to acknowledge.
  const green = incident();
  green.start();
  green.push(1, 1, true);
  assert.deepEqual(feedbackOf(attemptRecords(green.records, ISSUE), ISSUE, revisionFor).threads, []);
  // Only the incident turns CI failures into findings.
  assert.ok(
    catalog.issues
      .filter((i) => i.id !== ISSUE)
      .every((i) => catalog.revisions[i.revision].ciFindings === undefined),
  );
});

test("the incident's nit stays open on green CI and needs Resolve; explicit Resolve is only for findings", () => {
  const play = incident();
  play.start();
  const HARD_CODED = FIX.replace("shippingFor(subtotal, member)", "subtotal >= (member ? 3000 : 5000) ? 0 : 495");
  play.push(1, 1, true, HARD_CODED);
  const nit = reviewed(play.records, 1, 1).filter((r) => r.kind === "comment");
  assert.deepEqual(nit.map((r) => r.kind === "comment" && r.comment.id), ["thresholds-in-one-place"]);
  play.review(1, 1, "thresholds-in-one-place", "nit");
  // A later push fixes the code and CI is green; the nit is not resolved for the person.
  play.push(1, 2, true, FIX);
  const fb = () => feedbackOf(attemptRecords(play.records, ISSUE), ISSUE, revisionFor);
  const pull = () => allPullRequests(play.records).find((p) => p.number === 1)!;
  assert.equal(fb().threads[0].resolved, undefined, "still listed as unresolved");
  assert.deepEqual(openRequired(fb(), 1, revisionFor).map((t) => t.comment), ["thresholds-in-one-place"]);
  assert.equal(mergeBlocker(pull(), openRequired(fb(), 1, revisionFor).length), "review");
  // Severity alone would have let it through: the explicit Resolve is what the gate adds.
  assert.equal(openBlocking(fb(), 1).length, 0);
  play.resolve(1, "thresholds-in-one-place");
  assert.equal(mergeBlocker(pull(), openRequired(fb(), 1, revisionFor).length), null);
  // Explicit Resolve is for actionable review findings only, never for an informational note.
  for (const i of catalog.issues)
    for (const c of catalog.revisions[i.revision].team)
      if (c.resolve === "explicit")
        assert.ok(c.where === "review" && c.severity !== "info", `${i.id} ${c.id}`);
});

test("the timeline lists what this attempt did, in order, ending at the merge", () => {
  const play = incident();
  play.start();
  play.open();
  play.openFile(LOG);
  play.run(false);
  play.run(true);
  const run = play.push(1, 1, true);
  play.merge(1, run);
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
  play.merge(1, play.push(1, 1, true));
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

test("closed pull requests and replays: only the attempt's own merged, passing push counts", () => {
  const play = incident();
  play.start();
  play.push(1, 1, false);
  play.close(1);
  const first = play.push(2, 1, true);
  play.merge(2, first);
  assert.equal(incidentState(play.records).merged?.number, 2);
  const closed = incident();
  closed.start();
  closed.push(1, 1, true);
  closed.close(1);
  assert.equal(
    incidentState(closed.records).merged,
    null,
    "closed unmerged is not a fix",
  );
  assert.equal(
    allPullRequests(closed.records).find((p) => p.number === 1)?.state,
    "closed",
  );

  play.replay();
  assert.equal(
    incidentState(play.records).merged,
    null,
    "the first merge does not count",
  );
  play.push(3, 1, false);
  play.close(3);
  const replayRun = play.push(4, 1, true);
  const pulls = allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls.find((p) => p.number === 1)?.state, "closed");
  assert.equal(pulls.find((p) => p.number === 2)?.state, "merged");
  assert.equal(pulls.find((p) => p.number === 3)?.state, "closed");
  assert.equal(
    pulls.find((p) => p.number === 4)?.otherMerged,
    undefined,
    "#2 was another attempt",
  );
  play.merge(4, replayRun);
  const state = incidentState(play.records);
  assert.equal(state.attempt.number, 2);
  assert.equal(state.merged?.number, 4);
});
