import { test } from "node:test";
import assert from "node:assert/strict";
import { broken, fires, metric } from "./rules";

test("patterns look for text in the file, present or missing", () => {
  const code = "x = 1\nprint(x)\n";
  assert.equal(fires({ pattern: "^\\s*print\\(", present: true }, code, "a.py"), true);
  assert.equal(fires({ pattern: "^\\s*print\\(", present: false }, code, "a.py"), false);
  assert.equal(fires({ pattern: "Counter", present: false }, code, "a.py"), true);
});

test("combinators", () => {
  const code = "const x = price.toFixed(2);\n";
  const float = { pattern: "toFixed\\(", present: true } as const;
  const memo = { pattern: "this\\.cache", present: false } as const;
  assert.equal(fires({ all: [float, memo] }, code, "a.js"), true);
  assert.equal(fires({ all: [float, { not: memo }] }, code, "a.js"), false);
  assert.equal(fires({ any: [{ not: float }, { not: memo }] }, code, "a.js"), false);
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
  assert.equal(fires({ metric: "function-lines", above: 8 }, js, "a.js"), true);
});

test("broken lists the rules the code fires, in order", () => {
  const rules = [
    { id: "cents", message: "Keep money in cents.", when: { pattern: "toFixed", present: true } },
    { id: "memo", message: "Keep the memo.", when: { pattern: "cache", present: false } },
  ] as const;
  assert.deepEqual(
    broken(rules, "x.toFixed(2)", "a.js").map((r) => r.id),
    ["cents", "memo"],
  );
  assert.deepEqual(broken(rules, "this.cache = 1", "a.js"), []);
});
