import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { trace } from "./fixtures";
import { deriveAttempts } from "./derive";
import type { RunStatus, RunPurpose, SubmitResult } from "../domain/practice";
import {
  historyQuery,
  normalizeHistoryRows,
  historyResult,
  historyWindow,
  ownerHistory,
  readUploadedHistory,
  HistoryRefusal,
  HISTORY_MAX_RECORDS,
  type OwnerVerifier,
  type UploadedHistory,
} from "./uploaded-history";
import { privateView } from "./private-view";
import type { StoredRecord } from "../domain/records";
const participant = "synthetic-participant",
  secret = "synthetic-ownership-secret-for-tests-only";
const window = historyWindow({
  from: "2026-10-27",
  to: "2026-10-27",
  after: "",
});
function rows(
  records: StoredRecord[],
  p = participant,
  w = window,
  joined = false,
) {
  const events = records.map((r) => {
    const o = JSON.parse(r.payload);
    return {
      record_id: r.recordId,
      participant_id: r.participantId,
      kind: r.kind,
      payload: r.payload,
      type: o.type,
      attempt_id: o.attemptId,
      occurred_at: o.occurredAt,
    };
  });
  const script = `import sqlite3,json,sys
v=json.load(sys.stdin);c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
fields=['record_id','participant_id','kind','payload','type','attempt_id','occurred_at']
c.create_function('octet_length',1,lambda v:len(v.encode('utf-8')) if v is not None else None)
c.execute('CREATE TABLE events ('+', '.join(k+' TEXT' for k in fields)+')')
c.executemany('INSERT INTO events VALUES ('+','.join('?' for k in fields)+')',[[r.get(k) for k in fields] for r in v['events']])
print(json.dumps([dict(r) for r in c.execute(v['query'].replace('default.events','events'))]))`;
  const result = spawnSync("python3", ["-c", script], {
    input: JSON.stringify({ events, query: historyQuery(p, w) }),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  return (
    joined
      ? JSON.parse(result.stdout)
      : normalizeHistoryRows(JSON.parse(result.stdout))
  ) as any;
}
function result(records = trace()) {
  return historyResult(participant, window, rows(records));
}
const ready = (): Promise<UploadedHistory> => Promise.resolve(result());

test("operational diagnostics expose fixed stages, never upstream or record contents", async () => {
  const canary = "synthetic-private-canary-never-return";
  for (const [response, diagnostic] of [
    [Response.json({ error: canary }, { status: 400 }), "storage-http-400"],
    [Response.json({ success: false, error: canary }), "storage-result"],
    [new Response(canary), "response-json"],
    [
      Response.json({ success: true, result: { rows: [{ scope: canary }] } }),
      "row-shape",
    ],
  ] as const) {
    await assert.rejects(
      readUploadedHistory(
        "synthetic-token",
        participant,
        window,
        (async () => response) as typeof fetch,
      ),
      (error: unknown) => {
        assert.ok(error instanceof HistoryRefusal);
        assert.equal(error.status, 503);
        assert.equal(error.diagnostic, diagnostic);
        assert.ok(!JSON.stringify(error).includes(canary));
        assert.ok(!error.message.includes(canary));
        return true;
      },
    );
  }
});

test("identity refusals distinguish fixed fields without exposing values or accepting invalid records", async () => {
  const canary = "synthetic-private-value-never-return";
  const baseline = rows(trace(), participant, window, true);
  const fields = [
    ["participantId", "participant"],
    ["attemptId", "attempt"],
    ["observationId", "observation"],
    ["actor", "actor"],
    ["challenge", "challenge"],
    ["challengeRevision", "revision"],
  ] as const;
  for (const [field, category] of fields) {
    for (const value of [canary, null, undefined]) {
      const changed = structuredClone(baseline);
      const row = changed.find((r: any) => r.payload !== null);
      const observation = JSON.parse(row.payload);
      observation[field] = value;
      row.payload = JSON.stringify(observation);
      await assert.rejects(
        readUploadedHistory("synthetic-token", participant, window, (async () =>
          Response.json({
            success: true,
            result: { rows: changed },
          })) as typeof fetch),
        (error: unknown) => {
          assert.ok(error instanceof HistoryRefusal);
          assert.equal(error.status, 503);
          assert.equal(error.diagnostic, `identity-${category}`);
          const exposed = JSON.stringify(error) + error.message + error.stack;
          for (const privateValue of [
            canary,
            participant,
            row.attempt_id,
            row.record_id,
          ])
            assert.ok(!exposed.includes(privateValue));
          return true;
        },
      );
    }
  }
  const valid = await readUploadedHistory(
    "synthetic-token",
    participant,
    window,
    (async () =>
      Response.json({
        success: true,
        result: { rows: baseline },
      })) as typeof fetch,
  );
  assert.equal(valid.attempts.length, 1);
  assert.equal(valid.attempts[0].completed, true);
});

test("fixed query selects only owner and whole attempts, not arbitrary date fragments", () => {
  const a = trace();
  const opened = JSON.parse(a[0].payload);
  opened.occurredAt = "2026-10-26T23:59:00.000Z";
  a[0] = { ...a[0], payload: JSON.stringify(opened) };
  const foreign = trace("foreign").map((r) => ({
    ...r,
    participantId: "another-participant",
    payload: r.payload.replaceAll(participant, "another-participant"),
  }));
  const actual = historyResult(participant, window, rows([...a, ...foreign]));
  assert.equal(actual.attempts.length, 1);
  assert.equal(actual.attempts[0].started, "2026-10-26T23:59:00.000Z");
  assert.equal(actual.attempts[0].values.inserted, 5);
  assert.equal(actual.attempts[0].completed, true);
  assert.equal(actual.next, null);
  const output = JSON.stringify(actual);
  assert.ok(!output.includes('"payload"'));
  assert.ok(!output.includes('"keys"'));
  assert.ok(!output.includes('"changes"'));
  assert.ok(!output.includes("codeArtifactId"));
});
test("pagination covers all selected attempts without merging revisions or local summaries", () => {
  const records = Array.from({ length: 105 }, (_, i) =>
    trace(`attempt-${String(i).padStart(3, "0")}`, `source-${i}`),
  ).flat();
  const page = historyResult(participant, window, rows(records));
  assert.ok(page.attempts.length > 5);
  assert.ok(page.attempts.length <= 100);
  assert.ok(page.next);
  const nextWindow = { ...window, after: page.next! };
  const next = historyResult(
    participant,
    nextWindow,
    rows(records, participant, nextWindow),
  );
  assert.ok(next.attempts.length > 0);
  assert.equal(next.next, null);
  assert.equal(
    new Set([...page.attempts, ...next.attempts].map((a) => a.attempt)).size,
    105,
  );
});
test("duplicate uploads deduplicate; conflicts across attempts invalidate affected values", () => {
  const records = trace();
  const once = result(records).attempts[0],
    twice = result([...records, ...records]).attempts[0];
  assert.deepEqual(twice, once);
  const other = trace("other", "other-source");
  other[2] = {
    ...other[2],
    recordId: records[2].recordId,
    payload: other[2].payload.replace(
      JSON.parse(other[2].payload).observationId,
      records[2].recordId,
    ),
  };
  const summaries = result([...records, ...other]).attempts;
  assert.equal(summaries.length, 2);
  for (const a of summaries) {
    assert.ok(a.issues.some((s) => s.includes("Conflicting")));
    assert.ok(Object.values(a.values).every((v) => v === null));
  }
});
test("gaps, mixed revisions, oversized attempts and missing records remain explicit", () => {
  const r = trace();
  const g = result(r.filter((_, i) => i !== 2)).attempts[0];
  assert.ok(g.issues.length);
  assert.equal(g.values.inserted, null);
  const mixed = trace("same", "source-a");
  const revision = trace(
    "same",
    "source-b",
    "JS-001",
    `sha256:${"b".repeat(64)}`,
  );
  const summaries = result([...mixed, ...revision]).attempts;
  assert.equal(summaries.length, 2);
  assert.notEqual(summaries[0].revision, summaries[1].revision);
  const raw = rows(r);
  raw.find((r: { scope: string }) => r.scope === "attempt").observations =
    HISTORY_MAX_RECORDS + 1;
  const big = historyResult(participant, window, raw);
  assert.equal(big.attempts.length, 0);
  assert.ok(big.unavailable[0].reason.includes("budget"));
  assert.throws(
    () =>
      historyResult(
        participant,
        window,
        rows(r).filter((r: { scope: string }) => r.scope !== "observation"),
      ),
    /Incomplete/,
  );
  assert.throws(
    () => historyResult("another-participant", window, rows(r)),
    /identity mismatch/,
  );
});
test("invalid subject/cursor/window cannot become SQL", () => {
  for (const id of ["x' OR 1=1 --", "../x", ""])
    assert.throws(() => historyQuery(id, window));
  for (const value of [
    { ...window, after: "x'" },
    { ...window, from: "2026-02-30" },
    { ...window, to: "2025-10-27" },
    { ...window, from: "2020-01-01" },
  ])
    assert.throws(() => historyWindow(value));
  assert.ok(!historyQuery(participant, window).includes("snapshot"));
  assert.ok(!historyQuery(participant, window).includes("artifact'"));
});
test("private projection discards arbitrary reflection and checkpoint strings", () => {
  const r = trace().map((r) => {
    const o = JSON.parse(r.payload);
    if (o.type === "practice.answered")
      o.data = {
        question: "synthetic-private-text",
        answer: "synthetic-private-text",
      };
    if (o.type === "practice.run") o.data.purpose = "synthetic-private-text";
    return { ...r, payload: JSON.stringify(o) };
  });
  assert.ok(!JSON.stringify(result(r)).includes("synthetic-private-text"));
});
test("ID-only, upload-proof-only, wrong secret, absent and deleted ownership", async () => {
  let reads = 0;
  const load = async () => {
    reads++;
    return ready();
  };
  const denied: OwnerVerifier = { verify: async () => "denied" };
  await assert.rejects(ownerHistory(denied, load, participant, "", window));
  await assert.rejects(
    ownerHistory(denied, load, participant, "a".repeat(64), window),
  );
  assert.equal(reads, 0);
  assert.equal(
    (
      await ownerHistory(
        { verify: async () => "absent" },
        load,
        participant,
        secret,
        window,
      )
    ).state,
    "absent",
  );
  assert.equal(reads, 0);
  await assert.rejects(
    ownerHistory(
      { verify: async () => "deleted" },
      load,
      participant,
      secret,
      window,
    ),
    /deleted/,
  );
  assert.equal(reads, 0);
  let checks = 0;
  await assert.rejects(
    ownerHistory(
      { verify: async () => (++checks === 1 ? "owned" : "deleted") },
      load,
      participant,
      secret,
      window,
    ),
    /deleted/,
  );
  assert.equal(reads, 1);
  checks = 0;
  await assert.rejects(
    ownerHistory(
      { verify: async () => (++checks === 1 ? "owned" : "absent") },
      load,
      participant,
      secret,
      window,
    ),
    /ownership/,
  );
});
test("reset during a history read and a failed reread cannot resurrect uploaded history", async () => {
  const view = privateView<UploadedHistory>();
  await view.read(ready);
  assert.ok(view.getSnapshot().value);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const pending = view.read(async () => {
    await held;
    return ready();
  });
  view.invalidate(true);
  assert.equal(view.getSnapshot().value, null);
  release();
  await pending;
  assert.equal(view.getSnapshot().value, null);
  view.release();
  await view.read(async () => {
    throw new Error("Unavailable");
  });
  assert.equal(view.getSnapshot().value, null);
  assert.equal(view.getSnapshot().error, true);
});
test("transport projects only summaries, refuses upstream errors, bounds bytes and full deadline", async () => {
  const data = rows(trace());
  let posted = "";
  const request = (async (_url, init) => {
    posted = String(init?.body);
    assert.equal(init?.cache, "no-store");
    return Response.json({ success: true, result: { rows: data } });
  }) as typeof fetch;
  assert.equal(
    (await readUploadedHistory("synthetic-token", participant, window, request))
      .attempts.length,
    1,
  );
  assert.ok(posted.includes(participant));
  assert.ok(!posted.includes(secret));
  await assert.rejects(
    readUploadedHistory("synthetic-token", participant, window, (async () =>
      Response.json({ success: false, error: "private" })) as typeof fetch),
  );
  await assert.rejects(
    readUploadedHistory(
      "synthetic-token",
      participant,
      window,
      (async () => new Promise(() => {})) as typeof fetch,
      10,
    ),
    { diagnostic: "timeout" },
  );
  const stalled = (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("{"));
        },
      }),
    )) as typeof fetch;
  await assert.rejects(
    readUploadedHistory("synthetic-token", participant, window, stalled, 10),
    { diagnostic: "timeout" },
  );
  let cancelled = false;
  const large = (async () =>
    new Response(
      new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array(25 * 1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      }),
    )) as typeof fetch;
  await assert.rejects(
    readUploadedHistory("synthetic-token", participant, window, large),
    { diagnostic: "response-size" },
  );
  assert.equal(cancelled, true);
});

test("real recorded editor feature fingerprints survive private projection for matched history", () => {
  const records = trace().map((r) => {
    const o = JSON.parse(r.payload);
    if (o.type === "practice.opened") {
      o.data.editor = {
        name: "codemirror-6",
        features: [
          "javascript-syntax-highlighting",
          "javascript-auto-indent",
          "tab-indents",
          "undo-redo-history",
          "bracket-match-highlight",
          "line-numbers",
          "mod-enter-submits",
          "standard-keybindings",
        ],
      };
      o.data.runtime = { id: "javascript", version: "1" };
    }
    return { ...r, payload: JSON.stringify(o) };
  });
  const summary = result(records).attempts[0];
  assert.equal(summary.conditions.length, 2);
  assert.ok(
    summary.conditions.some((c) => c.startsWith("Editor: codemirror-6;")),
  );
});

test("deletion takes precedence over failed reads and invalid RPC states fail closed", async () => {
  let checks = 0;
  await assert.rejects(
    ownerHistory(
      { verify: async () => (++checks === 1 ? "owned" : "deleted") },
      async () => {
        throw new Error("Transient SQL failure");
      },
      participant,
      secret,
      window,
    ),
    /deleted/,
  );
  let reads = 0;
  await assert.rejects(
    ownerHistory(
      { verify: async () => "unexpected" } as unknown as OwnerVerifier,
      async () => {
        reads++;
        return ready();
      },
      participant,
      secret,
      window,
    ),
    /ownership/,
  );
  assert.equal(reads, 0);
});

// Exhaustive records make a future vocabulary addition a typecheck failure until reviewed.
const terminalLabels: Record<Exclude<RunStatus, "queued" | "running">, true> = {
  result: true,
  "user-error": true,
  "runner-error": true,
  timeout: true,
  cancelled: true,
};
const submissionLabels: Record<SubmitResult, true> = {
  passed: true,
  failed: true,
  errored: true,
  cancelled: true,
};
const purposes: Record<RunPurpose, true> = { examples: true, submit: true };
for (const purpose of Object.keys(purposes) as RunPurpose[])
  for (const status of Object.keys(
    terminalLabels,
  ) as (keyof typeof terminalLabels)[])
    test(`uploaded timeline preserves emitted ${purpose}/${status} checkpoints without error text`, () => {
      const records = trace().map((r) => {
        const o = JSON.parse(r.payload);
        if (o.type === "practice.run") {
          o.data.purpose = purpose;
          if (o.data.status !== "queued" && o.data.status !== "running") {
            o.data.status = status;
            o.data.outcome = {
              phase:
                status === "user-error"
                  ? "compile"
                  : status === "runner-error"
                    ? "runner"
                    : "test",
              error: "synthetic-private-run-text",
            };
          }
        }
        return { ...r, payload: JSON.stringify(o) };
      });
      const derived = deriveAttempts(records, participant)[0].timeline;
      assert.ok(derived.some((t) => t.label === `${purpose}: ${status}`));
      const uploaded = result(records);
      const projected = uploaded.attempts[0].timeline;
      assert.deepEqual(projected, derived);
      assert.ok(
        !JSON.stringify(uploaded).includes("synthetic-private-run-text"),
      );
      assert.ok(
        !projected.some(
          (t) => t.label.endsWith(": queued") || t.label.endsWith(": running"),
        ),
      );
    });
for (const outcome of Object.keys(submissionLabels) as SubmitResult[])
  test(`uploaded timeline preserves emitted ${outcome} submission checkpoints without rule IDs`, () => {
    const records = trace().map((r) => {
      const o = JSON.parse(r.payload);
      if (o.type === "practice.submitted")
        o.data = {
          ...o.data,
          result: outcome,
          passed: outcome === "passed" ? 2 : 0,
          total: 2,
          rules: ["synthetic-private-rule-id"],
        };
      return { ...r, payload: JSON.stringify(o) };
    });
    const derived = deriveAttempts(records, participant)[0].timeline;
    assert.ok(
      derived.some(
        (t) =>
          t.label ===
          `${outcome}: ${outcome === "passed" ? 2 : 0}/2 checks; 1 static rules`,
      ),
    );
    const uploaded = result(records);
    const projected = uploaded.attempts[0].timeline;
    assert.deepEqual(projected, derived);
    assert.ok(!JSON.stringify(uploaded).includes("synthetic-private-rule-id"));
  });

test("uploaded timeline rejects unknown outcome vocabulary and arbitrary checkpoint text", () => {
  const records = trace().map((r) => {
    const o = JSON.parse(r.payload);
    if (o.type === "practice.run") {
      o.data.purpose = "synthetic-private-purpose";
      o.data.status = "synthetic-private-status";
    }
    if (o.type === "practice.submitted")
      o.data.result = "synthetic-private-result";
    if (o.type === "practice.snapshot")
      o.data.reason = "synthetic-private-reason";
    return { ...r, payload: JSON.stringify(o) };
  });
  const projected = result(records).attempts[0].timeline;
  assert.ok(!JSON.stringify(projected).includes("synthetic-private-"));
  assert.ok(projected.some((t) => t.label === "started"));
});

test("large owned history returns a bounded summary prefix and an advancing cursor", () => {
  const records = Array.from({ length: 30 }, (_, i) => {
    const initial = trace(
      `long-${String(i).padStart(3, "0")}`,
      `long-source-${i}`,
    );
    const last = JSON.parse(initial.at(-1)!.payload);
    for (let j = 0; j < 180; j++) {
      const o = {
        ...last,
        observationId: `long-${i}-extra-${j}`,
        type: "practice.run",
        source: { ...last.source, sequence: initial.length + 1 },
        data: {
          runId: `extra-${j}`,
          purpose: "examples",
          status: "result",
          runtime: { engine: "javascript" },
          revision: 2,
          timeoutMs: 5000,
          via: "pointer",
        },
      };
      initial.push({
        ...initial[0],
        recordId: o.observationId,
        payload: JSON.stringify(o),
      });
    }
    return initial;
  }).flat();
  const start = performance.now();
  const page = historyResult(participant, window, rows(records));
  assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 256 * 1024);
  assert.ok(page.attempts.length > 0);
  assert.ok(page.attempts.length < 30);
  assert.ok(page.next);
  assert.ok(performance.now() - start < 15000);
});

test("near-budget prefixes measure their actual variable-length continuation cursor", () => {
  const records = Array.from({ length: 30 }, (_, i) => {
    const id =
      i === 29 ? "z" : `a${String(i).padStart(3, "0")}` + "x".repeat(110);
    const initial = trace(id, `source-${i}`);
    for (const r of initial) {
      const o = JSON.parse(r.payload);
      if (o.type === "practice.opened") {
        o.data.editor.features = ["x".repeat(443)];
        (r as { payload: string }).payload = JSON.stringify(o);
      }
    }
    const last = JSON.parse(initial.at(-1)!.payload);
    for (let j = 0; j < 180; j++) {
      const o = {
        ...last,
        observationId: `extra-${i}-${j}`,
        type: "practice.run",
        source: { ...last.source, sequence: initial.length + 1 },
        data: {
          runId: `extra-${j}`,
          purpose: "examples",
          status: "result",
          runtime: { engine: "javascript" },
          revision: 2,
          timeoutMs: 5000,
          via: "pointer",
        },
      };
      initial.push({
        ...initial[0],
        recordId: o.observationId,
        payload: JSON.stringify(o),
      });
    }
    return initial;
  }).flat();
  // Measuring with the query page's final short ID used to admit an oversized prefix and then throw503.
  const page = historyResult(
    participant,
    window,
    rows(records),
    "2026-10-27T12:00:00.000Z",
  );
  const bytes = Buffer.byteLength(JSON.stringify(page));
  assert.ok(bytes > 240000 && bytes <= 256 * 1024);
  assert.equal(page.attempts.length, 19);
  assert.equal(page.next, page.attempts.at(-1)!.attempt);
});

test("native UNION failure is avoided by a single SELECT, including empty and oversized metadata-only reads", () => {
  const query = historyQuery(participant, window);
  assert.ok(!query.includes("UNION ALL"));
  assert.match(query, /LEFT JOIN owner/);
  assert.equal(
    historyResult(
      participant,
      window,
      normalizeHistoryRows(rows([], participant, window, true)),
    ).attempts.length,
    0,
  );
  const entry = {
    scope: "entry",
    attempt_id: "oversized",
    observations: HISTORY_MAX_RECORDS + 1,
    bytes: 1,
    first_at: "2026-10-27T10:00:00Z",
    last_at: "2026-10-27T10:00:00Z",
    conflicts: 0,
    record_id: null,
    payload: null,
  };
  const value = historyResult(
    participant,
    window,
    normalizeHistoryRows([entry]),
  );
  assert.equal(value.attempts.length, 0);
  assert.equal(value.unavailable[0].attempt, "oversized");
  assert.equal(value.next, null);
});

test("joined rows retain exact coverage and ordering, reject missing or contradictory observations", () => {
  const joined = rows(
    [...trace("b", "source-b"), ...trace("a", "source-a")],
    participant,
    window,
    true,
  );
  const value = historyResult(
    participant,
    window,
    normalizeHistoryRows([...joined].reverse()),
  );
  assert.deepEqual(
    value.attempts.map((a) => a.attempt),
    ["a", "b"],
  );
  assert.throws(
    () =>
      historyResult(participant, window, normalizeHistoryRows(joined.slice(1))),
    /Incomplete/,
  );
  const altered = joined.map((r: any, i: number) =>
    i === 1 ? { ...r, bytes: Number(r.bytes) + 1 } : r,
  );
  assert.throws(() => normalizeHistoryRows(altered), /coverage/);
  assert.throws(
    () =>
      normalizeHistoryRows([
        { ...joined[0], record_id: null, payload: "not-null" },
      ]),
    /Invalid observation/,
  );
});

test("the actual transport accepts joined rows but never returns source payloads", async () => {
  const value = await readUploadedHistory(
    "synthetic-token",
    participant,
    window,
    async () =>
      Response.json({
        success: true,
        result: { rows: rows(trace(), participant, window, true) },
      }),
  );
  assert.equal(value.attempts.length, 1);
  assert.ok(!JSON.stringify(value).includes('"payload"'));
  assert.ok(!JSON.stringify(value).includes('"record_id"'));
  const entry = {
    scope: "entry",
    attempt_id: "budget",
    observations: 1,
    bytes: 1,
    first_at: "2026-10-27T10:00:00Z",
    last_at: "2026-10-27T10:00:00Z",
    conflicts: 0,
    record_id: "budget-row",
    payload: "x".repeat(6 * 1024 * 1024 + 1),
  };
  assert.throws(
    () => historyResult(participant, window, normalizeHistoryRows([entry])),
    /input exceeds/,
  );
});

/**
 * Exactly what the 1.0.0 (611d7cb) and 1.1.0 (933ac9b) envelopes produced, read from running
 * them: today's keys without `actor`. Uploads before 4a263e3 are stored in this form.
 */
const HISTORIC_KEYS = ["schemaVersion", "type", "observationId", "participantId", "sessionId", "source", "occurredAt", "elapsedMs", "captureVersion", "termsVersion", "assignments", "challenge", "challengeRevision", "attemptId", "data"];
function legacy(records: StoredRecord[], captureVersion = "practice-capture-1.1.0"): StoredRecord[] {
  return records.map((r) => {
    const o = JSON.parse(r.payload);
    delete o.actor;
    o.captureVersion = captureVersion;
    // Stored payloads are canonical (sorted keys), so the set is what matters.
    assert.deepEqual(Object.keys(o).sort(), [...HISTORIC_KEYS].sort());
    return { ...r, payload: JSON.stringify(o) };
  });
}
/** Changes some fields of the given records' payloads. */
const edit = (records: StoredRecord[], change: (o: any) => void) =>
  records.map((r) => {
    const o = JSON.parse(r.payload);
    change(o);
    return { ...r, payload: JSON.stringify(o) };
  });
/** Through the fixed query (in SQLite), the transport and every identity check. */
const read = (records: StoredRecord[]) =>
  readUploadedHistory("synthetic-token", participant, window, (async () =>
    Response.json({ success: true, result: { rows: rows(records, participant, window, true) } })) as typeof fetch);
const diagnostic = async (records: StoredRecord[]) =>
  read(records).then(
    () => "read",
    (e: unknown) => (e instanceof HistoryRefusal ? e.diagnostic : String(e)),
  );

test("uploads from before observations named their actor read as the person's own practice", async () => {
  const current = (await read(trace("cur-attempt", "cur-source"))).attempts[0];
  const old = (await read(legacy(trace("old-attempt", "old-source")))).attempts[0];
  assert.deepEqual(old.issues, []);
  assert.equal(old.completed, true);
  assert.deepEqual(old.values, current.values, "the same practice derives the same values in either form");
  // A page with a legacy attempt and a current one; and one attempt resumed across the change.
  const page = await read([...legacy(trace("a-old", "a-old-source")), ...trace("b-new", "b-new-source")]);
  assert.deepEqual(page.attempts.map((a) => [a.attempt, a.completed, a.issues.length]), [["a-old", true, 0], ["b-new", true, 0]]);
  const before = legacy(trace("resumed", "page-one")).slice(0, 4);
  const after = trace("resumed", "page-two").filter((r) => JSON.parse(r.payload).type !== "practice.started").map((r, i) => {
    const o = JSON.parse(r.payload);
    o.source.sequence = i + 1;
    o.observationId = `page-two.${i + 1}`;
    return { ...r, recordId: o.observationId, payload: JSON.stringify(o) };
  });
  const resumed = (await read([...before, ...after])).attempts[0];
  assert.deepEqual([resumed.completed, resumed.issues], [true, []]);
  // 1.0.0 reads too, and stays withheld as an unsupported capture version, as before.
  const v1 = (await read(legacy(trace("v1-attempt", "v1-source"), "practice-capture-1.0.0"))).attempts[0];
  assert.deepEqual(v1.issues, ["Unsupported capture version."]);
});

test("anything but the historic form still fails closed: models, named or malformed actors, unknown versions", async () => {
  const old = () => legacy(trace("x-attempt", "x-source"));
  const one = (records: StoredRecord[], change: (o: any) => void) => [...edit(records.slice(0, 1), change), ...records.slice(1)];
  for (const [name, records] of [
    ["a model's observation among a person's", one(trace("m-attempt", "m-source"), (o) => Object.assign(o, { actor: "model", termsVersion: null }))],
    ["a model's observation among legacy ones", one(old(), (o) => Object.assign(o, { captureVersion: "practice-capture-1.2.0", actor: "model", termsVersion: null }))],
    ["a legacy record that names a model", one(old(), (o) => (o.actor = "model"))],
    ["a legacy record that names a person (no such format existed)", one(old(), (o) => (o.actor = "person"))],
    ["a legacy record with a null actor", one(old(), (o) => (o.actor = null))],
    ["a legacy record without a Terms version", one(old(), (o) => delete o.termsVersion)],
    ["a legacy record with an undated Terms version", one(old(), (o) => (o.termsVersion = "latest"))],
    ["a current record without an actor", one(trace("c-attempt", "c-source"), (o) => delete o.actor)],
    ["an unknown version without an actor", one(old(), (o) => (o.captureVersion = "practice-capture-0.9.0"))],
    ["a malformed actor", one(trace("y-attempt", "y-source"), (o) => (o.actor = "Person"))],
  ] as const)
    assert.equal(await diagnostic(records as StoredRecord[]), "identity-actor", name);
  // Ownership and the other identity checks still apply to legacy records (attempt mismatches are
  // covered on joined rows above).
  assert.equal(await diagnostic(one(old(), (o) => (o.participantId = "another-participant"))), "identity-participant");
  assert.equal(await diagnostic(one(old(), (o) => (o.observationId = "x-source.999"))), "identity-observation");
  assert.equal(await diagnostic(one(old(), (o) => (o.challenge = "not a key"))), "identity-challenge");
});

test("on this device, legacy practice derives as the person's and a model's never does", () => {
  const current = deriveAttempts(trace("d-cur", "d-cur-source"), participant)[0];
  const old = deriveAttempts(legacy(trace("d-old", "d-old-source")), participant)[0];
  assert.deepEqual([old.completed, old.issues, old.values], [true, [], current.values]);
  const model = edit(trace("d-model", "d-model-source"), (o) => Object.assign(o, { actor: "model", termsVersion: null }));
  assert.deepEqual(deriveAttempts(model, participant), [], "a model's practice is not a person's evidence");
  const named = edit(legacy(trace("d-named", "d-named-source")), (o) => (o.actor = "person"));
  assert.deepEqual(deriveAttempts(named, participant), [], "a legacy version naming an actor never existed");
});
