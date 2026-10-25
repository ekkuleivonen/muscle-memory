import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import {
  actionsOf,
  evidenceOf,
  parsePublicEvidence,
  publicEvidence,
  type Evidence,
  type MergeBlocker,
} from "./evidence";
import { live } from "./test-fixtures";

const fixture = live("frequency-map");
const cases = fixture.revision.checks.cases;
const visible = cases.filter((c) => c.visible);
const revisionFor = (id: string) =>
  id === fixture.id ? fixture.revision : undefined;

/** Builds one attempt's records, minute by minute. */
function attempt() {
  const records: WorkspaceRecord[] = [];
  let sequence = 0;
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 9, 25, 9, minute)).toISOString();
  const add = (
    type: string,
    minute: number,
    data: Record<string, unknown> = {},
  ) => {
    sequence += 1;
    records.push({
      recordId: `obs-${sequence}`,
      kind: "observation",
      participantId: "p",
      payload: JSON.stringify({
        type,
        occurredAt: at(minute),
        source: { id: "s", sequence },
        issue: "frequency-map",
        issueRevision: fixture.id,
        data,
      }),
    });
  };
  /** A run's outcome over `over`, the first `passing` of them returning the expected value. */
  const outcome = (over: typeof cases, passing: number) => ({
    status: "completed",
    phase: "tests",
    cases: over.map(({ expected }, index) => ({
      index,
      output: {
        text: JSON.stringify(index < passing ? expected : "wrong"),
        bytes: 1,
        truncated: false,
      },
    })),
  });
  const code = (revision: number, text: string) =>
    records.push({
      recordId: `code-${revision}`,
      kind: "artifact",
      participantId: "p",
      payload: JSON.stringify({
        files: { [fixture.path]: { text, capture: { truncated: false } } },
      }),
    });
  return {
    records,
    at,
    add,
    opened: (
      minute: number,
      features = ["python-syntax-highlighting", "standard-keybindings"],
    ) =>
      add("observation.workspace.opened", minute, {
        editor: { name: "codemirror-6", features },
      }),
    edit: (minute: number, revision: number, userEvent = "input.type") =>
      add("observation.workspace.edit", minute, { revision, userEvent }),
    run: (minute: number, revision: number, passing: number | "error") =>
      add("observation.workspace.run", minute, {
        runId: `local-${minute}`,
        purpose: "local",
        revision,
        status: passing === "error" ? "user-error" : "result",
        outcome:
          passing === "error"
            ? {
                status: "user-error",
                phase: "load",
                error: { type: "SyntaxError", message: "x" },
              }
            : outcome(visible, passing),
      }),
    push: (
      minute: number,
      number: number,
      push: number,
      revision: number,
      passing: number,
    ) => {
      code(revision, `${fixture.starter}\n# fix ${revision}\n`);
      add("observation.workspace.run", minute, {
        runId: `pr-${minute}`,
        purpose: "pull-request",
        revision,
        status: "result",
        outcome: outcome(cases, passing),
      });
      add("observation.workspace.pull-request", minute, {
        number,
        push,
        runId: `pr-${minute}`,
        revision,
        codeArtifactId: `code-${revision}`,
        result: passing === cases.length ? "checks-passed" : "checks-failed",
        passed: passing,
        total: cases.length,
      });
    },
    review: (minute: number, number: number, push: number) =>
      add("observation.workspace.comment", minute, {
        comment: "priya-debug-print",
        where: "review",
        severity: "blocking",
        wording: 0,
        pullRequest: number,
        push,
      }),
    resolvedByCode: (minute: number, number: number, push: number) =>
      add("observation.workspace.thread-resolved", minute, {
        comment: "priya-debug-print",
        pullRequest: number,
        push,
        by: "code",
      }),
    hint: (minute: number) =>
      add("observation.workspace.hint", minute, { hint: "h1", level: 1 }),
    assist: (minute: number) =>
      add("observation.workspace.assist", minute, {
        file: fixture.path,
        kind: "hover",
        items: [],
      }),
    gap: (minute: number) =>
      add("observation.workspace.capture-gap", minute, {
        fromSequence: 3,
        toSequence: 4,
        reason: "buffer-full",
      }),
    merged: (minute: number, number: number) =>
      add("observation.board.moved", minute, {
        trigger: "pull-request-merged",
        pullRequest: number,
      }),
    closed: (minute: number, number: number) =>
      add("observation.board.closed", minute, { pullRequest: number }),
  };
}

const item = (evidence: Evidence, section: string, id: string) =>
  evidence.sections
    .find((s) => s.id === section)
    ?.items.find((i) => i.id === id);

test("a clean success: observed correctness, verification before push, no recovery needed", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.edit(2, 2);
  a.run(3, 2, visible.length);
  a.push(4, 1, 1, 2, cases.length);
  a.merged(5, 1);
  const evidence = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(5),
  })!;
  const { facts } = evidence;
  assert.equal(facts.state, "merged");
  assert.deepEqual(facts.checks, {
    result: "checks-passed",
    passed: cases.length,
    total: cases.length,
    legacy: false,
  });
  assert.deepEqual(facts.visible, {
    passed: visible.length,
    total: visible.length,
  });
  assert.deepEqual(facts.hidden, {
    passed: cases.length - visible.length,
    total: cases.length - visible.length,
  });
  assert.equal(facts.verification.beforePush, "tested-passing");
  assert.equal(facts.recovery.failedPushes, 0);
  assert.deepEqual(
    facts.changed?.map((f) => f.path).includes(fixture.path),
    true,
  );
  assert.equal(item(evidence, "correctness", "ci")?.tone, "pass");
  assert.equal(item(evidence, "recovery", "none")?.status, "observed");
  // Passing hidden checks is a limited inference, never a claim about production.
  assert.equal(item(evidence, "regression", "generalises")?.status, "inferred");
  assert.equal(item(evidence, "correctness", "production")?.status, "missing");
  assert.deepEqual(evidence.actions, []);
  // Timing comes last.
  assert.equal(evidence.sections.at(-1)?.id, "timing");
});

test("failure and recovery: failed runs, a failing push, a review finding fixed by code", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.run(2, 1, "error");
  a.run(3, 1, 1);
  a.edit(4, 2);
  a.run(5, 2, visible.length);
  a.push(6, 1, 1, 2, 5);
  a.review(7, 1, 1);
  a.edit(8, 3);
  a.push(9, 1, 2, 3, cases.length);
  a.resolvedByCode(10, 1, 2);
  a.merged(11, 1);
  const { facts, sections } = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(11),
  })!;
  assert.equal(facts.recovery.failedRuns, 1);
  assert.equal(facts.recovery.erroredRuns, 1);
  assert.equal(facts.recovery.failedPushes, 1);
  assert.deepEqual(facts.recovery.findings, {
    raised: 1,
    byCode: 1,
    byReply: 0,
    byResolve: 0,
    open: 0,
  });
  // The code was edited after the last local run, so only CI checked what was pushed.
  assert.equal(facts.verification.beforePush, "changed-after");
  const recovery = sections.find((s) => s.id === "recovery")!.items;
  assert.match(
    recovery.find((i) => i.id === "pushes")!.text,
    /failed on 1 push, then passed/,
  );
  assert.match(
    recovery.find((i) => i.id === "findings")!.text,
    /1 by a change to the code/,
  );
});

test("before merging: actions come from the merge gate's verdict, findings alongside", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.push(2, 1, 1, 1, 3);
  a.review(3, 1, 1);
  a.edit(4, 2);
  const read = (blocker?: MergeBlocker | null) =>
    evidenceOf({
      records: a.records,
      issue: "frequency-map",
      number: 1,
      revisionFor,
      blocker,
      until: a.at(5),
    })!;
  const ids = (blocker?: MergeBlocker | null) =>
    read(blocker).actions.map((x) => x.id);
  assert.equal(read("checks").facts.verification.beforePush, "none");
  assert.deepEqual(ids("checks"), ["checks", "review"]);
  assert.deepEqual(ids("checks-pending"), ["checks-pending", "review"]);
  assert.deepEqual(ids("code-changed"), ["code-changed", "review"]);
  assert.deepEqual(ids("code-unconfirmed"), ["code-unconfirmed", "review"]);
  assert.deepEqual(ids("revision"), ["revision", "review"]);
  assert.deepEqual(ids("review"), ["review"]);
  assert.deepEqual(read("code-changed").facts.stale, {
    pending: false,
    codeChanged: true,
    codeUnconfirmed: false,
    revision: false,
  });
  assert.equal(read("checks-pending").actions[0].where, "wait");
  // Without the gate's verdict nothing is guessed: an edit after the push is not called stale.
  assert.equal(read().facts.stale, null);
  assert.deepEqual(ids(), ["checks", "review"]);
  // Merged pull requests have nothing left to do.
  assert.deepEqual(
    actionsOf({ ...read("checks").facts, state: "merged" }, "not-open"),
    [],
  );
});

test("the latest result is the highest push number, even when an older push reports later", () => {
  const a = attempt();
  a.opened(0);
  a.push(1, 1, 2, 2, cases.length);
  // Push 1's result is recorded after push 2's.
  a.push(2, 1, 1, 1, 3);
  const { facts } = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(3),
  })!;
  assert.equal(facts.checks.result, "checks-passed");
  assert.equal(facts.checks.passed, cases.length);
  assert.equal(facts.pushes, 2);
  assert.equal(facts.first?.passed, 3);
});

test("unavailable measurements are reported as missing, not as zero", () => {
  const a = attempt();
  // No opened observation (editor help unknown), a capture gap, and no code kept.
  a.gap(0);
  a.push(1, 1, 1, 1, cases.length);
  a.records.splice(
    a.records.findIndex((r) => r.kind === "artifact"),
    1,
  );
  // A checks run that never reached the tests.
  const pr = a.records.find((r) =>
    r.payload.includes('"purpose":"pull-request"'),
  )!;
  const value = JSON.parse(pr.payload);
  value.data.outcome = { status: "runner-error", message: "crashed" };
  (pr as { payload: string }).payload = JSON.stringify(value);
  const evidence = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(2),
  })!;
  assert.equal(evidence.facts.changed, null);
  assert.equal(evidence.facts.hidden, null);
  assert.equal(evidence.facts.assistance.editorFeatures, null);
  assert.equal(item(evidence, "changed", "code")?.status, "missing");
  assert.equal(item(evidence, "changed", "gaps")?.status, "missing");
  assert.equal(item(evidence, "regression", "hidden")?.status, "missing");
  assert.equal(item(evidence, "assistance", "editor")?.status, "missing");
  assert.equal(publicEvidence(evidence.facts).gaps, true);
});

test("assistance is counted as what was on and used, with no judgement", () => {
  const a = attempt();
  a.opened(0, [
    "python-syntax-highlighting",
    "type-diagnostics",
    "hover-types",
    "vim-keybindings",
  ]);
  a.edit(1, 1, "input.paste");
  a.assist(2);
  a.hint(3);
  a.run(4, 1, visible.length);
  a.push(5, 1, 1, 1, cases.length);
  a.merged(6, 1);
  const evidence = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(6),
  })!;
  const { assistance } = evidence.facts;
  assert.equal(assistance.hints, 1);
  assert.equal(assistance.pastes, 1);
  assert.equal(assistance.typeHelp, 1);
  const editor = item(evidence, "assistance", "editor")!.text;
  assert.match(editor, /type errors and hover types/);
  assert.match(editor, /Vim keys/);
  assert.match(editor, /no autocomplete\. No AI or chat\./);
  assert.match(item(evidence, "assistance", "pastes")!.text, /isn't known/);
  // Nothing anywhere scores, ranks or diagnoses.
  const all = evidence.sections
    .flatMap((s) => s.items.map((i) => i.text))
    .join(" ");
  assert.doesNotMatch(
    all,
    /score|rank|badge|percentile|brain|dependen|faster than/i,
  );
});

test("historical records: pre-1.4.0 `merged` results and runs without a purpose still read", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.push(2, 1, 1, 1, cases.length);
  // Capture before 1.4.0 recorded passing checks as `merged`; before 1.2.0 runs had no purpose.
  for (const record of a.records) {
    const value = JSON.parse(record.payload);
    if (value.type === "observation.workspace.pull-request")
      value.data.result = "merged";
    if (
      value.type === "observation.workspace.run" &&
      value.data.purpose === "local"
    )
      delete value.data.purpose;
    (record as { payload: string }).payload = JSON.stringify(value);
  }
  a.merged(3, 1);
  const evidence = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(3),
  })!;
  assert.equal(evidence.facts.checks.result, "checks-passed");
  assert.equal(evidence.facts.checks.legacy, true);
  assert.equal(evidence.facts.recovery.failedPushes, 0);
  assert.equal(item(evidence, "correctness", "ci")?.tone, "pass");
  assert.equal(publicEvidence(evidence.facts).checks.result, "checks-passed");
});

test("an earlier pull request closed without merging counts toward recovery", () => {
  const a = attempt();
  a.opened(0);
  a.push(1, 1, 1, 1, 2);
  a.closed(2, 1);
  a.edit(3, 2);
  a.push(4, 2, 1, 2, cases.length);
  a.merged(5, 2);
  const { facts } = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 2,
    revisionFor,
    until: a.at(5),
  })!;
  assert.equal(facts.recovery.closedBefore, 1);
  assert.equal(
    evidenceOf({
      ...{
        records: a.records,
        issue: "frequency-map",
        revisionFor,
        until: a.at(5),
      },
      number: 9,
    }),
    null,
  );
});

test("public evidence carries counts only and round-trips through the validator", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.run(2, 1, visible.length);
  a.push(3, 1, 1, 1, cases.length);
  a.merged(4, 1);
  const { facts } = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(4),
  })!;
  const shared = publicEvidence(facts);
  const text = JSON.stringify(shared);
  // No code, no file paths, no timing.
  assert.doesNotMatch(text, /frequency_map|def |fix|active|elapsed|paste/);
  assert.deepEqual(parsePublicEvidence(JSON.parse(text)), shared);
  assert.equal(parsePublicEvidence({ ...shared, v: 2 }), null);
  assert.equal(
    parsePublicEvidence({
      ...shared,
      checks: { passed: 9, total: 1, result: "checks-passed" },
    }),
    null,
  );
  assert.equal(
    parsePublicEvidence({ ...shared, testedBeforePush: "maybe" }),
    null,
  );
  // Unknown keys are dropped, so nothing extra can ride along.
  assert.equal(
    "code" in parsePublicEvidence({ ...shared, code: "secret" })!,
    false,
  );
});

test("first submission and latest result are kept apart, in recorded push order", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.push(2, 1, 1, 1, 5);
  a.review(3, 1, 1);
  a.edit(4, 2);
  a.run(5, 2, visible.length);
  a.push(6, 1, 2, 2, cases.length);
  a.merged(7, 1);
  const evidence = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(7),
  })!;
  const { facts } = evidence;
  assert.deepEqual(
    {
      push: facts.first?.push,
      result: facts.first?.result,
      passed: facts.first?.passed,
      total: facts.first?.total,
    },
    { push: 1, result: "checks-failed", passed: 5, total: cases.length },
  );
  // Of the first five cases, the visible ones pass; one hidden case does.
  assert.deepEqual(facts.first?.visible, {
    passed: visible.length,
    total: visible.length,
  });
  assert.deepEqual(facts.first?.hidden, {
    passed: 5 - visible.length,
    total: cases.length - visible.length,
  });
  assert.deepEqual(facts.checks, {
    result: "checks-passed",
    passed: cases.length,
    total: cases.length,
    legacy: false,
  });
  assert.deepEqual(facts.beforeLatest, { failedChecks: 1, reviews: 1 });
  const first = item(evidence, "correctness", "first")!;
  assert.equal(first.status, "observed");
  assert.equal(first.tone, "fail");
  assert.match(
    first.text,
    /^First submitted \(push 1\): CI: 5 of 15 checks passed\.$/,
  );
  const latest = item(evidence, "correctness", "ci")!;
  assert.equal(latest.tone, "pass");
  assert.match(
    latest.text,
    /^Latest \(push 2, pushed after failing CI on 1 earlier push and 1 review comment on earlier pushes\): CI: 15 of 15 checks passed\.$/,
  );
  // Order only: nothing says why it changed.
  assert.doesNotMatch(first.text + latest.text, /because|learn|improv|phase/i);
  const shared = publicEvidence(facts);
  assert.deepEqual(shared.first, {
    passed: 5,
    total: cases.length,
    result: "checks-failed",
  });
  assert.deepEqual(
    parsePublicEvidence(JSON.parse(JSON.stringify(shared)))?.first,
    shared.first,
  );
});

test("a single submission is both first and latest; a missing first push is not known", () => {
  const a = attempt();
  a.opened(0);
  a.push(1, 1, 1, 1, cases.length);
  a.merged(2, 1);
  const once = evidenceOf({
    records: a.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: a.at(2),
  })!;
  assert.equal(once.facts.first?.result, "checks-passed");
  assert.deepEqual(once.facts.beforeLatest, { failedChecks: 0, reviews: 0 });
  assert.match(
    item(once, "correctness", "ci")!.text,
    /^First submitted \(push 1\), with no later pushes/,
  );

  // Push 1's record is gone: its result is not known, never guessed from the latest.
  const b = attempt();
  b.opened(0);
  b.push(1, 1, 1, 1, 3);
  b.push(2, 1, 2, 2, cases.length);
  b.merged(3, 1);
  const index = b.records.findIndex((r) => r.payload.includes('"push":1'));
  b.records.splice(index, 1);
  const lost = evidenceOf({
    records: b.records,
    issue: "frequency-map",
    number: 1,
    revisionFor,
    until: b.at(3),
  })!;
  assert.equal(lost.facts.first, null);
  assert.equal(item(lost, "correctness", "first")?.status, "missing");
  assert.equal(publicEvidence(lost.facts).first, null);
});

test("activity after the merge never changes the merged outcome", () => {
  const a = attempt();
  a.opened(0);
  a.edit(1, 1);
  a.run(2, 1, visible.length);
  a.push(3, 1, 1, 1, cases.length);
  a.merged(4, 1);
  const read = () =>
    evidenceOf({
      records: a.records,
      issue: "frequency-map",
      number: 1,
      revisionFor,
      until: a.at(4),
    })!;
  const before = read();
  // A later session on the same issue in the same attempt.
  a.opened(10, [
    "python-syntax-highlighting",
    "type-diagnostics",
    "hover-types",
    "vim-keybindings",
  ]);
  a.gap(11);
  a.edit(12, 2, "input.paste");
  a.assist(13);
  a.hint(14);
  a.run(15, 2, 1);
  a.review(16, 1, 1);
  a.add("observation.workspace.comment", 17, {
    comment: "priya-1",
    where: "issue",
    severity: "info",
    wording: 0,
  });
  a.add("observation.workspace.page", 18, {
    visible: false,
    focused: false,
    width: 1,
    height: 1,
  });
  const after = read();
  assert.deepEqual(after.facts, before.facts);
  assert.deepEqual(after.sections, before.sections);
});
