import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runFeedback } from "./workspace";
import type { Challenge } from "./assessment";

const challenge = JSON.parse(
  readFileSync(
    new URL("../../content/challenges/frequency-map.v2.json", import.meta.url),
    "utf8",
  ),
) as Challenge;
const output = (value: unknown, truncated = false) => ({
  output: { text: JSON.stringify(value), truncated },
});

test("feedback scores raw outputs as canonical JSON, never Python equality", () => {
  const feedback = runFeedback(challenge, [
    output({ b: 1, a: 2 }), // key order does not matter
    output({}),
    output({ A: true, a: 1 }), // Python's True == 1 would pass; JSON does not
    output(JSON.parse('{"__proto__":2,"x":1}'), true), // truncated: cannot be scored
  ]);
  assert.deepEqual(feedback.passed, [true, true, false, false]);
  assert.deepEqual(feedback.unscorable, [3]);
  assert.equal(feedback.correct, 2);
  // Missing cases (for example after a user error) are unscorable, not correct.
  assert.deepEqual(runFeedback(challenge, []).unscorable, [0, 1, 2, 3]);
});
