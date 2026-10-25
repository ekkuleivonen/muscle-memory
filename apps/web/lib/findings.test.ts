/**
 * Pull request findings, exercised on INC-1, the one revision whose review comments need an
 * explicit Resolve and whose CI failures are findings: Resolve never stands in for CI, findings
 * recur, and every attempt (replays included) is read on its own records.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptAt, attemptRecords } from "./attempts";
import {
  due,
  feedbackOf,
  openBlocking,
  openRequired,
  type Release,
} from "./feedback";
import { mergeEligibility } from "./merge";
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

/** A recorded attempt at INC-1, one step at a time, a minute apart. */
function incident() {
  const records: WorkspaceRecord[] = [];
  // The IDE and the tracker record in streams of their own, each numbered without gaps.
  const sequences = { s: 0, b: 0 };
  let sequence = 0;
  let minute = 0;
  let pushes = 0;
  let codeRevision = 0;
  const now = () => new Date(Date.UTC(2026, 9, 24, 2, minute)).toISOString();
  const observe = (
    type: string,
    data: Record<string, unknown>,
    revision: string = fixture.id,
  ) => {
    const stream = type.startsWith("observation.board.") ? "b" : "s";
    sequence = ++sequences[stream];
    minute += 1;
    records.push({
      recordId: `${stream}.${sequence}`,
      kind: "observation",
      participantId: "p",
      payload: JSON.stringify({
        observationId: `${stream}.${sequence}`,
        type,
        occurredAt: now(),
        source: { id: stream, sequence },
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
    /** The IDE opened on a revision: what the person is working on from then. */
    open(revision: string = fixture.id) {
      observe("observation.workspace.opened", {}, revision);
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
    /** The editor's code saved as it stands (an exact snapshot), as after any edit. */
    save(text: string, revision: string = fixture.id) {
      codeRevision += 1;
      const artifact = `s.code.${codeRevision}`;
      records.push({
        recordId: artifact,
        kind: "artifact",
        participantId: "p",
        payload: JSON.stringify({
          type: "artifact.code-revision",
          artifactId: artifact,
          owner: "participant",
          participantId: "p",
          revision: codeRevision,
          files: {
            [fixture.path]: {
              mediaType: "text/javascript",
              text,
              capture: { truncated: false },
            },
          },
          truncated: false,
        }),
      });
      observe(
        "observation.workspace.snapshot",
        { revision: codeRevision, codeArtifactId: artifact, reason: "periodic" },
        revision,
      );
      return { artifact, codeRevision };
    },
    /** A push whose checks are still running: started, never reported. */
    queued() {
      const runId = `ci-${++pushes}`;
      observe("observation.workspace.run", {
        runId,
        purpose: "pull-request",
        status: "queued",
      });
      return runId;
    },
    /** A push's result recorded on its own, possibly after a newer push's. */
    report(
      number: number,
      push: number,
      runId: string,
      artifact: string,
      passing: boolean,
      revision: string = fixture.id,
    ) {
      observe(
        "observation.workspace.pull-request",
        {
          number,
          push,
          runId,
          codeArtifactId: artifact,
          result: passing ? "checks-passed" : "checks-failed",
          passed: passing ? cases.length : cases.length - 1,
          total: cases.length,
        },
        revision,
      );
    },
    push(
      number: number,
      push: number,
      passing: boolean,
      text = FIX,
      revision: string = fixture.id,
    ) {
      const { artifact } = this.save(text, revision);
      const runId = `ci-${++pushes}`;
      observe(
        "observation.workspace.run",
        {
          runId,
          purpose: "pull-request",
          status: "result",
          outcome: outcome(cases, (i) => passing || i !== 1),
        },
        revision,
      );
      this.report(number, push, runId, artifact, passing, revision);
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

/** What stands between pull request `number` and merging, as the merge button and the merge read it. */
function blockerOf(
  records: readonly WorkspaceRecord[],
  number: number,
  published: (id: string) => boolean = (id) => !!catalog.revisions[id],
) {
  const own = attemptRecords(records, ISSUE);
  const pull = allPullRequests(records).find((p) => p.issue === ISSUE && p.number === number)!;
  return mergeEligibility({
    records: own,
    issue: ISSUE,
    number,
    pull,
    published,
    openRequired: openRequired(feedbackOf(own, ISSUE, revisionFor), number, revisionFor).length,
  }).blocker;
}

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

test("a replay starts fresh: an earlier merge never satisfies it, and nothing earlier is lost", () => {
  const play = incident();
  const begun = play.start();
  const run = play.push(1, 1, true);
  play.merge(1, run);
  play.push(2, 1, false, "// tinkering after the merge\n");
  const before = play.records.length;
  play.replay();
  assert.equal(play.records.length, before + 1, "a replay only adds");
  assert.equal(attemptAt(play.records, ISSUE).number, 2);
  assert.equal(attemptAt(play.records, ISSUE, begun).number, 1);
  const replayRun = play.push(3, 1, true);
  const pulls = () => allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls().find((p) => p.number === 1)?.state, "merged", "the first is on record");
  assert.equal(pulls().find((p) => p.number === 2)?.otherMerged, 1);
  assert.equal(pulls().find((p) => p.number === 3)?.otherMerged, undefined);
  play.merge(3, replayRun);
  assert.equal(pulls().find((p) => p.number === 3)?.state, "merged");
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
  const blocker = () => blockerOf(play.records, 1);
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
  const blocker = () => blockerOf(play.records, 1);

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

test("INC-1's nit stays open on green CI and needs Resolve; other exercises keep severity rules", () => {
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
  assert.equal(blockerOf(play.records, 1), "review");
  // Severity alone would have let it through: the explicit Resolve is what the gate adds.
  assert.equal(openBlocking(fb(), 1).length, 0);
  play.resolve(1, "thresholds-in-one-place");
  assert.equal(blockerOf(play.records, 1), null);
  // Every other exercise keeps its own rules: no explicit comments, so the gate is unchanged.
  assert.ok(
    catalog.issues
      .filter((i) => i.id !== ISSUE)
      .every((i) => catalog.revisions[i.revision].team.every((c) => c.resolve === undefined)),
  );
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

test("closed pull requests and replays: only the attempt's own merge puts it in Done", () => {
  const play = incident();
  play.start();
  play.push(1, 1, false);
  play.close(1);
  const first = play.push(2, 1, true);
  play.merge(2, first);
  const closed = incident();
  closed.start();
  closed.push(1, 1, true);
  closed.close(1);
  assert.equal(
    allPullRequests(closed.records).find((p) => p.number === 1)?.state,
    "closed",
    "closed unmerged is not a fix",
  );

  play.replay();
  play.push(3, 1, false);
  play.close(3);
  const replayRun = play.push(4, 1, true);
  const pulls = () => allPullRequests(play.records).filter((p) => p.issue === ISSUE);
  assert.equal(pulls().find((p) => p.number === 1)?.state, "closed");
  assert.equal(pulls().find((p) => p.number === 2)?.state, "merged");
  assert.equal(pulls().find((p) => p.number === 3)?.state, "closed");
  assert.equal(
    pulls().find((p) => p.number === 4)?.otherMerged,
    undefined,
    "#2 was another attempt",
  );
  play.merge(4, replayRun);
  assert.equal(attemptAt(play.records, ISSUE).number, 2);
  assert.equal(pulls().find((p) => p.number === 4)?.state, "merged");
});

test("a shared INC-1 card still carries its version and attempt; bad ones are dropped", () => {
  // The /r/<card> route (ENG-324) still reads these fields until it drops its incident branch.
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
    iv: fixture.id.replace(/^sha256:/, "").slice(0, 8),
    a: 2,
    e: 257,
  };
  assert.deepEqual(decodeResult(encodeResult(card)), card);
  const decoded = decodeResult(encodeResult({ ...card, iv: "nothex!!", a: 0 }))!;
  assert.equal(decoded.iv, undefined);
  assert.equal(decoded.a, undefined);
  assert.equal(decoded.e, undefined);
  assert.equal(
    incidentSentence(card),
    "Production was down. AI was down. In a no-AI incident sim I restored checkout in 4 min 17 s (6 min 52 s active), on a replay.",
  );
  assert.equal(incidentTime({ ...card, e: undefined }), "6 min 52 s active");
});

/** Resolve every open finding on pull request `number`. */
function resolveAll(play: ReturnType<typeof incident>, number: number) {
  const own = attemptRecords(play.records, ISSUE);
  for (const t of openRequired(feedbackOf(own, ISSUE, revisionFor), number, revisionFor))
    play.resolve(number, t.comment);
}

test("green CI, then the code changes: no merge until it is pushed again", () => {
  const play = incident();
  play.start();
  play.open();
  play.push(1, 1, true);
  assert.equal(blockerOf(play.records, 1), null);
  play.save(FIX + "\n// one more thought\n");
  assert.equal(blockerOf(play.records, 1), "code-changed");
  resolveAll(play, 1);
  assert.equal(blockerOf(play.records, 1), "code-changed", "Resolve never stands in for CI");
  // Back to exactly what was pushed: the checks describe it again.
  play.save(FIX);
  assert.equal(blockerOf(play.records, 1), null);
  play.save(FIX + "\n// one more thought\n");
  play.push(1, 2, true, FIX + "\n// one more thought\n");
  assert.equal(blockerOf(play.records, 1), null, "pushing the change makes it mergeable");
});

test("checks against a revision the attempt has left, or one not published, never merge", () => {
  const newer = "sha256:" + "1".repeat(64);
  const both = (id: string) => id === newer || !!catalog.revisions[id];
  const play = incident();
  play.start();
  play.open();
  play.push(1, 1, true);
  assert.equal(blockerOf(play.records, 1, both), null);
  // The ticket was updated and the IDE reopened on it: these checks ran against the old one.
  play.open(newer);
  assert.equal(blockerOf(play.records, 1, both), "revision");
  resolveAll(play, 1);
  assert.equal(blockerOf(play.records, 1, both), "revision");
  play.push(1, 2, true, FIX, newer);
  assert.equal(blockerOf(play.records, 1, both), null);
  // A revision no longer published can't be vouched for.
  assert.equal(blockerOf(play.records, 1), "revision");
});

test("a pinned earlier revision stays honest: its own checks count, the live one isn't swapped in", () => {
  const pinned = "sha256:" + "2".repeat(64);
  const both = (id: string) => id === pinned || !!catalog.revisions[id];
  const play = incident();
  play.start(pinned);
  play.open(pinned);
  play.push(1, 1, true, FIX, pinned);
  // The live revision differs, but this attempt is on the pinned one and CI checked that.
  assert.notEqual(pinned, fixture.id);
  assert.equal(blockerOf(play.records, 1, both), null);
});

test("a late result from an older push never decides; a push still running blocks", () => {
  const play = incident();
  play.start();
  play.open();
  play.push(1, 1, false);
  // Push 2 fails; push 1's green result then arrives late. The latest push is still red.
  const { artifact } = play.save(FIX);
  play.report(1, 2, "ci-late-2", artifact, false);
  play.report(1, 1, "ci-late-1", artifact, true);
  assert.equal(blockerOf(play.records, 1), "checks");
  resolveAll(play, 1);
  assert.equal(blockerOf(play.records, 1), "checks", "resolving the CI finding changes nothing");
  // Push 3 passes, then push 4 starts and hasn't reported: what would merge is unknown.
  play.push(1, 3, true);
  resolveAll(play, 1);
  assert.equal(blockerOf(play.records, 1), null);
  play.queued();
  assert.equal(blockerOf(play.records, 1), "checks-pending");
});
