import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { deriveAttempts, editVolume } from "./derive";
import { trace, syntheticRevision } from "./fixtures";
import { localHistory } from "./history";
import { openPracticeStore } from "../browser/practice-store";
import { SUMMARY_KEY } from "./registry";
import type { StoredRecord } from "../domain/records";
const derive = (rs = trace()) => deriveAttempts(rs, "synthetic-participant")[0];
function change(r: StoredRecord, edit: (o: any) => void): StoredRecord {
  const o = JSON.parse(r.payload);
  edit(o);
  return { ...r, payload: JSON.stringify(o) };
}
test("known trace: run IDs, edit volume, key timestamps, waits, recovery and retrospective answers", () => {
  const s = derive(),
    v = s.values;
  assert.deepEqual(s.issues, []);
  assert.equal(v.runs, 2);
  assert.equal(v.submissions, 2);
  assert.equal(v.examples, 0);
  assert.equal(v.firstEdit, 100);
  assert.equal(v.firstRun, 5000);
  assert.equal(v.firstSubmit, 0);
  assert.equal(v.inserted, 5);
  assert.equal(v.deleted, 2);
  assert.equal(v.edits, 2);
  assert.equal(v.paste, 1);
  assert.equal(v.bursts, 2);
  assert.equal(v.pauses, 1);
  assert.equal(v.keyInterval, 90);
  assert.equal(v.corrections, 1);
  assert.equal(v.navigation, 1);
  assert.equal(v.runnerWait, 2000);
  assert.equal(v.betweenRuns, 2000);
  assert.equal(v.editsBetweenRuns, 1);
  assert.equal(v.recoveries, 1);
  assert.equal(v.recoveryTime, 3000);
  assert.equal(v.recoveryEdits, 1);
  assert.equal(v.elapsed, 9300);
  assert.deepEqual(s.answers, { confidence: "unsure" });
  assert.equal(s.completed, true);
  assert.equal(s.practice, "unknown");
});
test("deduplication and source order are independent of arrival order", () => {
  const rs = trace();
  assert.deepEqual(derive([...rs].reverse().concat(rs)), derive(rs));
});
test("missing positions, starts, explicit gaps, conflicting record IDs withhold values, never zero", () => {
  const rs = trace();
  for (const partial of [
    rs.slice(1),
    rs.filter((_, i) => i !== 3),
    [...rs, change(rs[2], (o) => (o.data.docLength = 999))],
    rs.map((r, i) =>
      i === 2
        ? change(r, (o) => {
            o.type = "practice.capture-gap";
            o.data = { fromSequence: 4, toSequence: 5, reason: "buffer-full" };
          })
        : r,
    ),
  ]) {
    const s = derive(partial);
    assert.ok(s.issues.length);
    assert.equal(s.values.edits, null);
    assert.equal(s.values.runs, null);
  }
});
test("truncated changes withhold volume but preserve observed transactions", () => {
  const rs = trace().map((r, i) =>
    i === 2
      ? change(r, (o) => {
          o.data.changes = null;
          o.data.changesTruncated = true;
        })
      : r,
  );
  const s = derive(rs);
  assert.equal(s.values.inserted, null);
  assert.equal(s.values.smallEdits, null);
  assert.equal(s.values.edits, 2);
});
test("timeouts, cancellations and infrastructure failures are not first-submit failures", () => {
  for (const status of ["runner-error", "timeout", "cancelled"]) {
    const rs = trace().map((r) =>
      change(r, (o) => {
        if (
          o.data.runId === "r1" &&
          o.type === "practice.run" &&
          o.data.status === "result"
        )
          o.data.status = status;
        if (o.data.runId === "r1" && o.type === "practice.submitted")
          o.data.result = "errored";
      }),
    );
    const s = derive(rs);
    assert.equal(s.values.firstSubmit, null);
    assert.equal(s.values.recoveries, 0);
  }
});
test("unfinished queued run has unknown wait, no fabricated submission or completion", () => {
  const s = derive(trace().slice(0, 5));
  assert.equal(s.values.runs, 1);
  assert.equal(s.values.runnerWait, null);
  assert.equal(s.values.firstSubmit, null);
  assert.equal(s.completed, false);
  assert.deepEqual(s.answers, {});
});
test("source resume preserves key clocks and never subtracts independent monotonic clocks", () => {
  const rs = trace();
  const first = rs.slice(0, 2).map((r, i) =>
    change(r, (o) => {
      if (i === 1) {
        o.type = "practice.closed";
        o.data = { reason: "left" };
      }
    }),
  );
  const resume = rs.slice(1).map((r, i) => {
    const o = JSON.parse(r.payload);
    o.source = { id: "resume", sequence: i + 1 };
    o.observationId = `resume.${i + 1}`;
    o.elapsedMs += 10000;
    o.occurredAt = new Date(Date.parse(o.occurredAt) + 60000).toISOString();
    if (o.data.keys)
      o.data.keys = o.data.keys.map((k: any[]) => [
        k[0] + 10000,
        ...k.slice(1),
      ]);
    return { ...r, recordId: o.observationId, payload: JSON.stringify(o) };
  });
  const s = derive([...resume, ...first]);
  assert.deepEqual(s.issues, []);
  assert.equal(s.values.firstEdit, null);
  assert.equal(s.values.firstRun, null);
  assert.equal(s.values.returns, 1);
  assert.equal(s.values.bursts, 2);
});
test("exact revisions stay separate, foreign participants and models never enter private stats", () => {
  const rs = trace();
  const other = trace("other", "other", "JS-001", `sha256:${"b".repeat(64)}`);
  const model = rs.map((r) => change(r, (o) => (o.actor = "model")));
  assert.equal(
    deriveAttempts([...rs, ...other], "synthetic-participant").length,
    2,
  );
  assert.equal(deriveAttempts(rs, "other").length, 0);
  assert.equal(deriveAttempts(model, "synthetic-participant").length, 0);
});
test("CodeMirror volumes support multiline insertion, deletion and reject malformed data", () => {
  assert.deepEqual(editVolume([2, [3, "a", "b"], [5]]), {
    inserted: 3,
    deleted: 8,
  });
  for (const x of [null, [[-1, "a"]], [[2, {}]], ["bad"]])
    assert.equal(editVolume(x), null);
});
test("compaction retains code-free summaries atomically; backup, reset and deletion propagate", async () => {
  const store = await openPracticeStore(new IDBFactory());
  const first = trace(),
    second = trace("repeat", "later").map((r) =>
      change(r, (o) => {
        o.occurredAt = new Date(
          Date.parse(o.occurredAt) + 86400000,
        ).toISOString();
        if (o.type === "practice.started") o.data.from = "again";
      }),
    );
  await store.restore({
    settings: { participantId: "synthetic-participant" },
    records: [...first, ...second],
    outbox: [],
  });
  assert.equal(await store.compact(true), first.length);
  const dump = await store.dump();
  const saved = JSON.parse(dump.settings[SUMMARY_KEY]);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].completed, true);
  assert.ok(!JSON.stringify(saved).includes("KeyA"));
  assert.ok(!JSON.stringify(saved).includes("synthetic-artifact"));
  const history = localHistory(dump);
  assert.equal(history.length, 2);
  assert.equal(history[1].practice, "repeat");
  await store.clear(false);
  assert.equal((await store.dump()).settings[SUMMARY_KEY], undefined);
  assert.deepEqual(localHistory(await store.dump()), []);
  await store.restore(dump);
  assert.equal(localHistory(await store.dump()).length, 2);
  await store.clear(true);
  assert.deepEqual((await store.dump()).settings, {});
  store.close();
});
test("queued older attempt stays whole until summary can be safely retained", async () => {
  const store = await openPracticeStore(new IDBFactory());
  const rs = trace(),
    newer = trace("new", "new");
  await store.restore({
    settings: { participantId: "synthetic-participant" },
    records: [
      ...rs,
      ...newer.map((r) =>
        change(r, (o) => (o.occurredAt = "2026-10-28T00:00:00Z")),
      ),
    ],
    outbox: [rs[0].recordId],
  });
  assert.equal(await store.compact(true), 0);
  assert.equal((await store.records()).length, rs.length + newer.length);
  store.close();
});
test("empty and latest-only history are explicitly distinct from complete history", () => {
  assert.deepEqual(localHistory({ settings: {}, records: [], outbox: [] }), []);
  const s = derive(trace().slice(1));
  assert.ok(s.issues.some((i) => i.includes("start")));
  assert.equal(s.practice, "unknown");
  assert.equal(s.revision, syntheticRevision);
});

test("invalid key payload and unsupported capture version are unavailable rather than crashing or becoming zero", () => {
  const rs = trace();
  const malformed = rs.map((r, i) =>
    i === 3 ? change(r, (o) => (o.data.keys = null)) : r,
  );
  const s = derive(malformed);
  assert.equal(s.values.bursts, null);
  assert.ok(s.issues.length);
  const unsupported = derive(
    rs.map((r) =>
      change(r, (o) => (o.captureVersion = "practice-capture-future")),
    ),
  );
  assert.equal(unsupported.values.runs, null);
  assert.ok(unsupported.issues.some((i) => i.includes("Unsupported")));
});

test("passing all cases with fired static rules is not first-submit success; clearing them is improvement", () => {
  const rs = trace().map((r) =>
    change(r, (o) => {
      if (o.type === "practice.submitted" && o.data.runId === "r1") {
        o.data.result = "passed";
        o.data.passed = 3;
        o.data.rules = ["synthetic-rule"];
      }
    }),
  );
  const s = derive(rs);
  assert.equal(s.values.firstSubmit, 0);
  assert.equal(s.values.recoveries, 1);
  assert.equal(s.values.recoveryChecks, 1);
  assert.equal(s.values.recoveryTime, 3000);
});

test("default compaction preserves current latest-only privacy promise, without retaining history summaries", async () => {
  const store = await openPracticeStore(new IDBFactory());
  const first = trace();
  const second = trace("later", "later-source").map((r) =>
    change(r, (o) => (o.occurredAt = "2026-10-28T00:00:00Z")),
  );
  await store.restore({
    settings: { participantId: "synthetic-participant" },
    records: [...first, ...second],
    outbox: [],
  });
  assert.equal(await store.compact(), first.length);
  assert.equal((await store.dump()).settings[SUMMARY_KEY], undefined);
  store.close();
});

test("future summary-path failure aborts compaction without discarding evidence", async () => {
  const store = await openPracticeStore(new IDBFactory());
  const first = trace(),
    second = trace("next", "next-source").map((r) =>
      change(r, (o) => (o.occurredAt = "2026-10-28T00:00:00Z")),
    );
  await store.restore({
    settings: {
      participantId: "synthetic-participant",
      [SUMMARY_KEY]: "not JSON",
    },
    records: [...first, ...second],
    outbox: [],
  });
  await assert.rejects(store.compact(true));
  assert.equal((await store.records()).length, first.length + second.length);
  store.close();
});

test("pre-test compile/runtime user errors recover to tests, separately from infrastructure", () => {
  for (const phase of ["compile", "runtime"]) {
    const rs = trace().map((r) =>
      change(r, (o) => {
        if (
          o.type === "practice.run" &&
          o.data.runId === "r1" &&
          o.data.status === "result"
        ) {
          o.data.status = "user-error";
          o.data.outcome = { status: "user-error", phase };
        }
        if (
          o.type === "practice.run" &&
          o.data.runId === "r2" &&
          o.data.status === "result"
        )
          o.data.outcome = { status: "completed", phase: "tests" };
        if (o.type === "practice.submitted" && o.data.runId === "r1") {
          o.data.result = "errored";
          o.data.passed = 0;
        }
      }),
    );
    const v = derive(rs).values;
    assert.equal(v.userErrors, 1);
    assert.equal(v.userErrorRecoveries, 1);
    assert.equal(v.recoveries, 1);
    assert.equal(v.firstSubmit, 0);
    assert.equal(v.recoveryTime, 3000);
    assert.equal(v.recoveryEdits, 1);
    assert.equal(v.runnerErrors, 0);
  }
});
test("runner failure, timeout, cancellation and unknown errored submissions never become user recoveries", () => {
  for (const status of ["runner-error", "timeout", "cancelled", "result"]) {
    const rs = trace().map((r) =>
      change(r, (o) => {
        if (
          o.type === "practice.run" &&
          o.data.runId === "r1" &&
          o.data.status === "result"
        ) {
          o.data.status = status;
          o.data.outcome = { phase: "runtime" };
        }
        if (o.type === "practice.submitted" && o.data.runId === "r1")
          o.data.result = "errored";
      }),
    );
    const v = derive(rs).values;
    assert.equal(v.userErrors, 0);
    assert.equal(v.recoveries, 0);
    assert.equal(v.userErrorRecoveries, 0);
    assert.equal(v.firstSubmit, null);
    assert.equal(v.runnerErrors, status === "runner-error" ? 1 : 0);
    assert.equal(v.timeouts, status === "timeout" ? 1 : 0);
    assert.equal(v.cancellations, status === "cancelled" ? 1 : 0);
  }
});
