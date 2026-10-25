import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunView } from "../workspace/session";
import { transcript, type Executable } from "./transcript";

const challenge: Executable = {
  language: "javascript",
  entry: "src/format-price.js",
  entrypoint: "formatPrice",
  cases: [
    { id: "case-1", input: 123456, expected: "$1,234.56", visible: true },
    { id: "case-2", input: -500, expected: "-$5.00", visible: true },
  ],
};

const bounded = (text: string) => ({
  text,
  bytes: text.length,
  truncated: false,
});
const run = (outcome: RunView["outcome"]): RunView => ({
  runId: "r",
  revision: 3,
  status: "result",
  purpose: "examples",
  outcome,
});
const text = (view: RunView) =>
  transcript(view, challenge, "JavaScript (browser)")
    .map((line) => `${line.tone}|${line.text}`)
    .join("\n");

test("a thrown error shows with its trace under its case, after what was printed", () => {
  const error = {
    type: "Error",
    message: "lol",
    traceback: bounded(
      "Error: lol\n  at formatPrice (src/format-price.js:6:9)\n",
    ),
  };
  const out = text(
    run({
      status: "completed",
      phase: "tests",
      cases: [
        { index: 0, error },
        { index: 1, output: bounded('"-$5.00"'), repr: bounded("-$5.00") },
      ],
      stdout: bounded("checking\n"),
      stderr: bounded("careful\n"),
      durationMs: 8,
    }),
  );
  assert.equal(
    out,
    [
      "dim|$ run examples · JavaScript",
      "out|checking",
      "err|careful",
      "fail|✘ formatPrice(123456)",
      "err|    Error: lol",
      "err|      at formatPrice (src/format-price.js:6:9)",
      "pass|✔ formatPrice(-500)",
      "fail|1 passed, 1 failed · 8 ms",
    ].join("\n"),
  );
});

test("a wrong value shows what was expected and what came back", () => {
  const out = text(
    run({
      status: "completed",
      phase: "tests",
      cases: [
        { index: 0, output: bounded('"123456"'), repr: bounded("123456") },
        { index: 1, output: bounded('"-$5.00"'), repr: bounded("-$5.00") },
      ],
      stdout: bounded(""),
      stderr: bounded(""),
      durationMs: 2,
    }),
  );
  assert.match(out, /dim\| {4}expected "\$1,234\.56"\nfail\| {4}got {6}123456/);
});

test("compile errors, timeouts and runtime failures are all shown", () => {
  const compile = text(
    run({
      status: "user-error",
      phase: "compile",
      error: {
        type: "SyntaxError",
        message: "Unexpected token",
        traceback: bounded(
          "SyntaxError: Unexpected token\n  at src/x.js:1:5\n",
        ),
      },
      cases: [],
      stdout: bounded(""),
      stderr: bounded(""),
      durationMs: 1,
    }),
  );
  assert.match(
    compile,
    /err\|SyntaxError: Unexpected token\nerr\| {2}at src\/x\.js:1:5\nfail\|The code did not compile; no cases ran\./,
  );
  assert.match(
    text(run({ status: "timeout", timeoutMs: 5000 })),
    /err\|Stopped after 5 s/,
  );
  assert.match(
    text(run({ status: "runner-error", phase: "bootstrap", message: "gone" })),
    /err\|The test runner crashed; this wasn't your code/,
  );
  assert.deepEqual(transcript(null, challenge, "x"), []);
});

test("additional checks reveal categories, never hidden names, values, traces or printed inputs", () => {
  const secret = "PRIVATE_SENTINEL";
  const hidden: Executable = {
    ...challenge,
    cases: [
      {
        id: "private",
        name: secret + " name",
        input: secret + " input",
        expected: secret + " expected",
        visible: false,
      },
    ],
  };
  const hiddenRun: RunView = {
    ...run({
      status: "completed",
      phase: "tests",
      cases: [
        {
          index: 0,
          error: { type: secret, message: secret, traceback: bounded(secret) },
        },
      ],
      stdout: bounded(secret + " stdout"),
      stderr: bounded(secret + " stderr"),
      durationMs: 1,
    }),
    purpose: "submit",
  };
  const result = transcript(hiddenRun, hidden, "JavaScript")
    .map((line) => line.text)
    .join("\n");
  assert.doesNotMatch(result, /PRIVATE_SENTINEL/);
  assert.match(result, /Additional check: Raised an error/);
  const wrong = transcript(
    {
      ...hiddenRun,
      outcome: {
        status: "completed",
        phase: "tests",
        cases: [{ index: 0, output: bounded(secret), repr: bounded(secret) }],
        stdout: bounded(""),
        stderr: bounded(""),
        durationMs: 1,
      },
    },
    hidden,
    "JavaScript",
  )
    .map((line) => line.text)
    .join("\n");
  assert.doesNotMatch(wrong, /PRIVATE_SENTINEL/);
  assert.match(wrong, /Returned a different value/);
});

test("full Submit never reveals run-level compile/load error text with hidden cases", () => {
  const hidden: Executable = {
    ...challenge,
    cases: [
      ...challenge.cases,
      {
        id: "secret",
        input: "SECRET_INPUT",
        expected: "SECRET_EXPECTED",
        visible: false,
      },
    ],
  };
  for (const phase of ["compile", "execute"] as const) {
    const view: RunView = {
      ...run({
        status: "user-error",
        phase,
        error: {
          type: "SECRET_TYPE",
          message: "SECRET_MESSAGE",
          traceback: bounded("SECRET_INPUT"),
        },
        stdout: bounded("SECRET_PRINT"),
        stderr: bounded("SECRET_STDERR"),
        cases: [],
        durationMs: 2,
      }),
      purpose: "submit",
    };
    const rendered = transcript(view, hidden, "JavaScript")
      .map((l) => l.text)
      .join("\n");
    assert.doesNotMatch(rendered, /SECRET_/);
    assert.match(rendered, /Run examples/);
  }
});
