import { test } from "node:test";
import assert from "node:assert/strict";
import type { Case } from "../../../packages/content/model";
import { diagnose, failureOf, failureText, hiddenLabel } from "./diagnosis";

const cases: Case[] = [
  {
    id: "a",
    name: "counts words",
    input: ["a a"],
    expected: { a: 2 },
    visible: true,
  },
  { id: "b", input: [""], expected: {}, visible: true },
  {
    id: "c",
    name: "ignores case",
    input: ["A a"],
    expected: { a: 2 },
    visible: false,
  },
];
const out = (value: unknown) => ({
  output: { text: JSON.stringify(value), truncated: false },
});

test("a failing public case shows its input, the expected value and what the code returned", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [out({ a: 1 }), out({}), out({ a: 2 })],
    },
    cases,
  );
  if (d?.kind !== "tests") return assert.fail("expected per-case results");
  assert.equal(d.rows.length, 3);
  assert.deepEqual(d.failed, [
    {
      name: "counts words",
      visible: true,
      passed: false,
      failure: { category: "wrong-value" },
      detail: {
        input: ["a a"],
        expected: { a: 2 },
        got: { label: "Got", text: '{"a":1}' },
      },
    },
  ]);
});

test("a hidden case is no oracle: its name and failure category, never its values", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [
        out({ a: 2 }),
        {},
        { error: { type: "KeyError", message: "'A'" } },
      ],
    },
    cases,
  );
  if (d?.kind !== "tests") return assert.fail("expected per-case results");
  const [unnamed, hidden] = d.failed;
  assert.equal(unnamed.name, "case 2");
  assert.deepEqual(unnamed.failure, { category: "no-result" });
  assert.deepEqual(unnamed.detail?.got, { label: "Got", text: "nothing" });
  assert.deepEqual(hidden, {
    name: "hidden case 3",
    visible: false,
    passed: false,
    // Neither the error's type nor its message: user code can set both from the input.
    failure: { category: "raised" },
    detail: null,
  });
  // Passing hidden cases carry no values either.
  const passing = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [out({ a: 2 }), out({}), out({ a: 2 })],
    },
    cases,
  );
  if (passing?.kind !== "tests")
    return assert.fail("expected per-case results");
  assert.equal(passing.rows[2].detail, null);
  assert.ok(!JSON.stringify(passing.rows[2]).includes("A a"));
});

test("values that can't be compared get their own category", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [
        { output: { text: '{"a":', truncated: true } },
        { unserializable: "a function" },
        { output: { text: "[]", truncated: false } },
      ],
    },
    cases,
  );
  if (d?.kind !== "tests") return assert.fail("expected per-case results");
  assert.deepEqual(
    d.failed.map((r) => r.failure?.category),
    ["cut-short", "not-json", "wrong-value"],
  );
  assert.deepEqual(
    d.failed.map((r) => r.detail?.got?.text ?? null),
    ['{"a": (cut short)', "a value that isn't JSON (a function)", null],
  );
});

test("a check that never reached the cases gives its error, not per-case guesses", () => {
  assert.deepEqual(
    diagnose(
      {
        status: "user-error",
        phase: "compile",
        error: {
          type: "SyntaxError",
          message: "invalid syntax",
          traceback: { text: "line 3" },
        },
      },
      // Public cases only: a run with hidden ones shows no error text (hidden-cases.test.ts).
      cases.filter((c) => c.visible),
    ),
    {
      kind: "error",
      stage: "compile",
      error: { type: "SyntaxError", message: "invalid syntax" },
      traceback: "line 3",
    },
  );
  assert.deepEqual(diagnose({ status: "timeout", timeoutMs: 5000 }, cases), {
    kind: "stopped",
    reason: "timeout",
    timeoutMs: 5000,
  });
  assert.equal(diagnose({ status: "runner-error" }, cases)?.kind, "stopped");
  assert.equal(diagnose(null, cases), null);
  assert.equal(diagnose({ status: "completed" }, undefined), null);
});

test("a passing run has no failures", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [out({ a: 2 }), out({}), out({ a: 2 })],
    },
    cases,
  );
  assert.deepEqual(d?.kind === "tests" && d.failed, []);
});

test("the practice area's live results get the same categories, with no values or messages", () => {
  const raised = failureOf({ error: { type: "KeyError" } });
  assert.deepEqual(raised, { category: "raised" });
  assert.equal(failureText(raised), "Raised an error.");
  assert.equal(failureOf({ repr: { text: "3" } }).category, "wrong-value");
  assert.equal(failureOf({ conversionError: {} }).category, "not-json");
  assert.equal(failureOf(undefined).category, "no-result");
  assert.equal(
    failureText({ category: "wrong-value" }),
    "Returned a different value from the one expected.",
  );
});

test("a hidden case is labelled by position, never by its call or its name", () => {
  assert.equal(hiddenLabel(6), "hidden case 7");
  const d = diagnose({ status: "completed", phase: "tests", cases: [{}, {}] }, [
    { id: "x", input: [1], expected: 1, visible: true },
    { id: "y", input: ["secret"], expected: 2, visible: false },
  ]);
  if (d?.kind !== "tests") return assert.fail("expected per-case results");
  assert.deepEqual(
    d.rows.map((r) => r.name),
    ["case 1", "hidden case 2"],
  );
  assert.ok(!JSON.stringify(d.rows[1]).includes("secret"));
});

test("a crash or timeout part-way through is reported as stopped, not as an error before the cases", () => {
  // Two cases had run when the runner stopped.
  const partial = [out({ a: 2 }), out({})];
  for (const status of ["timeout", "runner-error"] as const) {
    const d = diagnose(
      { status, phase: "tests", cases: partial, timeoutMs: 5000 },
      cases,
    );
    assert.equal(d?.kind, "stopped", status);
  }
  // An error with the cases missing names no stage.
  const d = diagnose({ status: "user-error", phase: "tests" }, cases);
  assert.deepEqual(d, {
    kind: "error",
    stage: "runtime",
    error: null,
    traceback: null,
  });
});
