import { test } from "node:test";
import assert from "node:assert/strict";
import type { Case } from "../../../packages/content/model";
import { diagnose } from "./diagnosis";

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

test("a failing visible case shows its input, what the code returned and the expected value", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [out({ a: 1 }), out({}), out({ a: 2 })],
    },
    cases,
  );
  assert.equal(d?.kind, "tests");
  if (d?.kind !== "tests") return;
  assert.equal(d.rows.length, 3);
  assert.deepEqual(d.failed, [
    {
      name: "counts words",
      input: ["a a"],
      visible: true,
      expected: { value: { a: 2 } },
      passed: false,
      observed: 'returned {"a":1}',
    },
  ]);
});

test("a failing CI-only case says what the code did, never the answer it wanted", () => {
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
  assert.equal(unnamed.observed, "returned nothing");
  assert.deepEqual(unnamed.expected, { value: {} });
  assert.equal(hidden.name, "ignores case");
  assert.equal(hidden.expected, null);
  assert.equal(hidden.observed, "raised KeyError: 'A'");
  // Passing CI-only cases don't show their expected value either.
  assert.ok(d.rows.filter((r) => !r.visible).every((r) => r.expected === null));
});

test("values that can't be read are described as such", () => {
  const d = diagnose(
    {
      status: "completed",
      phase: "tests",
      cases: [
        { output: { text: '{"a":', truncated: true } },
        { unserializable: "a function" },
        out({ a: 2 }),
      ],
    },
    cases,
  );
  if (d?.kind !== "tests") return assert.fail("expected per-case results");
  assert.deepEqual(
    d.failed.map((r) => r.observed),
    [
      'returned {"a": (cut short)',
      "returned a value that isn't JSON (a function)",
    ],
  );
});

test("CI that never reached the tests gives its error, not per-case guesses", () => {
  assert.deepEqual(
    diagnose(
      {
        status: "user-error",
        phase: "load",
        error: {
          type: "SyntaxError",
          message: "invalid syntax",
          traceback: { text: "line 3" },
        },
      },
      cases,
    ),
    {
      kind: "error",
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
