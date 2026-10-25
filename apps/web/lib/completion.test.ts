import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openPracticeStore } from "../../../packages/browser/practice-store";
import {
  codeRevision,
  toRecord,
  type WorkspaceRecord,
} from "../../../packages/domain/workspace";
import { checkRecord } from "../../../packages/domain/ingest";
import { completionEligibility, completions } from "./completion";
import { completePractice } from "./complete-practice";
import { catalog, live } from "./test-fixtures";
import { allPullRequests } from "./pulls";
import { attemptAt } from "./attempts";
import { BOARD_KEY } from "./board";

const issue = "frequency-map";
const fixture = live(issue);
const revisionFor = (id: string) => catalog.revisions[id];
const clean = "def frequency_map(items):\n    return {}\n"; // The recorded outcome below, not this text, is the fixture under test.
function attempt(code = clean) {
  let seq = 0;
  const records: WorkspaceRecord[] = [];
  const observe = (type: string, data: object, rev = fixture.id) => {
    seq++;
    records.push({
      recordId: `workspace-test.${seq}`,
      kind: "observation",
      participantId: "participant-test",
      payload: JSON.stringify({
        type,
        observationId: `workspace-test.${seq}`,
        participantId: "participant-test",
        source: { id: "workspace-test", sequence: seq },
        occurredAt: new Date(1790000000000 + seq).toISOString(),
        issue,
        issueRevision: rev,
        data,
      }),
    });
  };
  const artifact = toRecord(
    codeRevision("participant-test", "workspace-test", 1, {
      [fixture.path]: { text: code, mediaType: "text/x-python" },
    }),
  );
  records.push(artifact);
  observe("observation.workspace.opened", {
    revision: 1,
    codeArtifactId: artifact.recordId,
  });
  observe("observation.workspace.snapshot", {
    revision: 1,
    codeArtifactId: artifact.recordId,
    reason: "run",
  });
  const run = {
    runId: "verified-run",
    revision: 1,
    codeArtifactId: artifact.recordId,
    purpose: "pull-request",
    via: "keyboard",
  };
  observe("observation.workspace.run", { ...run, status: "queued" });
  const outcome = {
    status: "completed",
    phase: "tests",
    cases: fixture.revision.checks.cases.map((c, index) => ({
      index,
      output: { text: JSON.stringify(c.expected), truncated: false },
    })),
    stdout: { text: "", bytes: 0, truncated: false },
    stderr: { text: "", bytes: 0, truncated: false },
    durationMs: 1,
  };
  observe("observation.workspace.pull-request", {
    number: 1,
    push: 1,
    ...run,
    result: "checks-passed",
    passed: outcome.cases.length,
    total: outcome.cases.length,
  });
  observe("observation.workspace.run", { ...run, status: "result", outcome });
  const gate = (current = code, revision = fixture.id) =>
    completionEligibility({
      records,
      issue,
      revision,
      revisionFor,
      currentFiles: { [fixture.path]: current },
    });
  return { records, observe, gate, run, outcome, artifact };
}

test("completion needs the exact saved and currently tested code/revision, complete full-suite outcomes", () => {
  const a = attempt();
  assert.equal(a.gate().blocker, null);
  assert.equal(a.gate().via, "keyboard");
  assert.equal(a.gate("unsaved edit").blocker, "code-changed");
  assert.equal(a.gate(clean, "sha256:" + "0".repeat(64)).blocker, "revision");
  const b = attempt();
  b.observe("observation.workspace.run", {
    ...b.run,
    status: "result",
    outcome: { ...b.outcome, cases: b.outcome.cases.slice(0, 1) },
  });
  assert.equal(b.gate().blocker, "checks");
  const c = attempt();
  c.observe("observation.workspace.run", {
    ...c.run,
    purpose: "local",
    status: "result",
    outcome: c.outcome,
  });
  assert.equal(c.gate().blocker, "code-unconfirmed");
  const d = attempt();
  d.records[0] = {
    ...d.artifact,
    payload: JSON.stringify({
      ...JSON.parse(d.artifact.payload),
      truncated: true,
    }),
  };
  assert.equal(d.gate().blocker, "code-unconfirmed");
});

test("a newer pending run or changed pinned revision never completes on an older result", () => {
  const a = attempt();
  a.observe("observation.workspace.run", {
    ...a.run,
    runId: "newer",
    status: "queued",
  });
  assert.equal(a.gate().blocker, "checks-pending");
  const b = attempt();
  b.observe("observation.workspace.opened", {}, "sha256:" + "b".repeat(64));
  assert.equal(b.gate().blocker, "revision");
});

test("same-millisecond pending runs and malformed/error outcomes cannot reuse green", () => {
  const a = attempt();
  const start = JSON.parse(
    a.records.find((r) => JSON.parse(r.payload).data?.status === "queued")!
      .payload,
  );
  a.observe("observation.workspace.run", {
    ...a.run,
    runId: "same-ms",
    status: "queued",
  });
  const pending = a.records.at(-1)!;
  a.records[a.records.length - 1] = {
    ...pending,
    payload: JSON.stringify({
      ...JSON.parse(pending.payload),
      occurredAt: start.occurredAt,
    }),
  };
  assert.equal(a.gate().blocker, "checks-pending");
  for (const patch of [
    { cases: undefined },
    { status: "cancelled" },
    { status: "runner-error" },
    { phase: "compile" },
    {
      cases: a.outcome.cases.map((c, i) =>
        i ? c : { ...c, error: { type: "Error" } },
      ),
    },
    { cases: a.outcome.cases.map((c, i) => (i ? c : { ...c, index: 99 })) },
    {
      cases: a.outcome.cases.map((c, i) =>
        i ? c : { ...c, output: { text: "null", truncated: false } },
      ),
    },
  ]) {
    const b = attempt();
    b.observe("observation.workspace.run", {
      ...b.run,
      status: "result",
      outcome: { ...b.outcome, ...patch },
    });
    assert.equal(b.gate().blocker, "checks");
  }
});

test("required code rules survive replies/Resolve; correcting code clears them without ritual; style nits do not block", () => {
  const a = attempt('print("debug")\n' + clean);
  a.observe("observation.board.resolved", {
    pullRequest: 1,
    comment: "priya-debug-print",
    via: "pointer",
  });
  a.observe("observation.board.replied", {
    pullRequest: 1,
    comment: "priya-debug-print",
    text: "ignore it",
  });
  assert.equal(a.gate().blocker, "review");
  assert.equal(a.gate().required[0].id, "priya-debug-print");
  assert.equal(attempt().gate().blocker, null);
  const long = attempt(
    "def frequency_map(items):\n" +
      "    x = 1\n".repeat(20) +
      "    return {}\n",
  );
  assert.equal(long.gate().blocker, null);
});

test("real atomic completion writer records once, preserves Submit cause, queues result, and leaves legacy readers truthful", async () => {
  const storage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  };
  (globalThis as any).window = { dispatchEvent: () => true };
  const store = await openPracticeStore(new IDBFactory());
  try {
    const a = attempt();
    await store.write(a.records);
    const input = {
      participantId: "participant-test",
      termsVersion: "2026-10-25.1",
      issue: {
        key: "FN-1",
        slug: issue,
        revision: fixture.id,
        language: "python",
      },
      revisionFor,
      currentFiles: () => ({ [fixture.path]: clean }),
      ready: () => true,
    };
    const original = await store.workspaceRecords();
    assert.equal(
      await completePractice(store, { ...input, ready: () => false }),
      false,
    );
    assert.equal(
      await completePractice(store, {
        ...input,
        currentFiles: () => ({ [fixture.path]: "unsaved" }),
      }),
      false,
    );
    assert.deepEqual(await store.workspaceRecords(), original);
    // A failing transaction rolls back both derived records and queued uploads.
    const queuedBefore = (await store.pending(100, 1_000_000)).records.length;
    await assert.rejects(
      store.commitWorkspace(() => [
        { ...a.artifact, recordId: "new-record" },
        a.artifact,
      ]),
    );
    assert.deepEqual(await store.workspaceRecords(), original);
    assert.equal(
      (await store.pending(100, 1_000_000)).records.length,
      queuedBefore,
    );
    const results = await Promise.all([
      completePractice(store, input),
      completePractice(store, input),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const all = await store.workspaceRecords();
    assert.equal(completions(all, issue).length, 1);
    const completion = all
      .map((r) => JSON.parse(r.payload))
      .find((v) => v.type === "observation.board.moved");
    assert.equal(completion.captureVersion, "board-capture-7.2.0");
    assert.equal(completion.data.trigger, "checks-passed");
    assert.equal(completion.data.via, "keyboard");
    assert.equal(completion.data.runId, "verified-run");
    assert.equal(JSON.parse(storage.get(BOARD_KEY)!).items[0].status, "done");
    assert.equal(
      allPullRequests(all)[0].state,
      "open",
      "automatic completion is not a historical merge",
    );
    assert.equal(attemptAt(all, issue).number, 1);
    assert.equal(
      all.filter(
        (r) => JSON.parse(r.payload).type === "observation.board.result",
      ).length,
      1,
    );
    for (const record of all.filter(
      (r) => !a.records.some((original) => original.recordId === r.recordId),
    ))
      assert.equal(
        checkRecord(record, "participant-test", new Date().toISOString()).ok,
        true,
      );
    assert.equal(
      (await store.pending(100, 1_000_000)).records.length,
      all.length,
    );
    const before = await store.workspaceRecords();
    assert.equal(
      await completePractice(store, { ...input, ready: () => false }),
      false,
    );
    assert.deepEqual(await store.workspaceRecords(), before);
  } finally {
    store.close();
  }
});
