import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, metric, wordingFor, type Facts } from "./triggers";

const idle = { activeMinutesWithoutProgress: 0, runsWithoutProgress: 0, failingPushes: 0 };
const facts = (files: Record<string, string>, more: Partial<Facts> = {}): Facts => ({
  files,
  behaviour: idle,
  ...more,
});

test("patterns look in every editable file, or the one named", () => {
  const f = facts({ "a.py": "x = 1\nprint(x)\n", "b.py": "y = 2\n" });
  assert.equal(evaluate({ pattern: "^\\s*print\\(", present: true }, f), true);
  assert.equal(evaluate({ pattern: "^\\s*print\\(", present: true, file: "b.py" }, f), false);
  assert.equal(evaluate({ pattern: "Counter", present: false }, f), true);
});

test("a check trigger needs a push's results; events are only what just happened", () => {
  assert.equal(evaluate({ check: "case-1", is: "failing" }, facts({})), false);
  const pushed = facts({}, { cases: { "case-1": false }, event: "push" });
  assert.equal(evaluate({ check: "case-1", is: "failing" }, pushed), true);
  assert.equal(evaluate({ check: "case-1", is: "passing" }, pushed), false);
  assert.equal(evaluate({ event: "push" }, pushed), true);
  assert.equal(evaluate({ event: "pull-request" }, pushed), false);
});

test("behaviour thresholds and combinators", () => {
  const stuck = facts({}, {
    behaviour: { activeMinutesWithoutProgress: 12, runsWithoutProgress: 4, failingPushes: 2 },
  });
  assert.equal(evaluate({ behaviour: "active-minutes-without-progress", atLeast: 12 }, stuck), true);
  assert.equal(evaluate({ behaviour: "failing-pushes", atLeast: 3 }, stuck), false);
  assert.equal(
    evaluate(
      {
        all: [
          { behaviour: "runs-without-progress", atLeast: 3 },
          { not: { behaviour: "failing-pushes", atLeast: 3 } },
        ],
      },
      stuck,
    ),
    true,
  );
  assert.equal(
    evaluate({ any: [{ event: "push" }, { behaviour: "failing-pushes", atLeast: 5 }] }, stuck),
    false,
  );
});

test("metrics read code as text: lines, the longest function, the deepest block", () => {
  const python = [
    "def short(x):",
    "    return x",
    "",
    "def longer(items):",
    "    counts = {}",
    "    for item in items:",
    "        if item:",
    "            counts[item] = 1",
    "    # done",
    "    return counts",
    "",
  ].join("\n");
  assert.equal(metric("lines", python, "a.py"), 8);
  assert.equal(metric("function-lines", python, "a.py"), 7);
  assert.equal(metric("nesting", python, "a.py"), 3);
  const js = [
    "export function total(items) {",
    '  const open = "{{{";',
    "  for (const item of items) {",
    "    if (item.ok) {",
    "      sum += item.price; // }",
    "    }",
    "  }",
    "  return this.#sum;",
    "}",
  ].join("\n");
  // Braces in strings and comments do not count; `#sum` is not a comment in JavaScript.
  assert.equal(metric("function-lines", js, "a.js"), 9);
  assert.equal(metric("nesting", js, "a.js"), 3);
  assert.equal(
    evaluate({ metric: "function-lines", above: 8 }, facts({ "a.js": js })),
    true,
  );
});

test("each person sees one stable wording of a comment", () => {
  const a = wordingFor("person-1", "ada-1", 3);
  assert.equal(wordingFor("person-1", "ada-1", 3), a);
  assert.ok(a >= 0 && a < 3);
  const seen = new Set(
    Array.from({ length: 50 }, (_, i) => wordingFor(`person-${i}`, "ada-1", 3)),
  );
  assert.equal(seen.size, 3);
});
