import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunView } from "../workspace/session";
import { transcript, type Executable } from "./transcript";

const challenge = {
  id: "format-price",
  version: "1.0.0",
  assessment_version: "1.0.0",
  task: "",
  skills: [],
  hints: [],
  entrypoint: "formatPrice",
  starter: "",
  inputs: [123456, -500],
  expected: ["$1,234.56", "-$5.00"],
} as Executable;

const bounded = (text: string) => ({
  text,
  bytes: text.length,
  truncated: false,
});
const run = (outcome: RunView["outcome"]): RunView => ({
  runId: "r",
  revision: 3,
  status: "result",
  purpose: "local",
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
      "dim|$ run tests · revision 3 · JavaScript (browser)",
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
    /err\|JavaScript \(browser\) failed \(bootstrap\), not your code: gone/,
  );
  assert.deepEqual(transcript(null, challenge, "x"), []);
});
