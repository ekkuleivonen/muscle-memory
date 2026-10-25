import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown, safeHref } from "./markdown";
import { live } from "./test-fixtures";

test("SQL challenge schemas render as structured tables without interpreting HTML", () => {
  const blocks = parseMarkdown(live("SQL-002").revision.task);
  const table = blocks.find((block) => block.type === "table");
  assert.ok(table && table.type === "table");
  assert.equal(table.header.length, 4);
  assert.equal(table.rows.length, 6);
  assert.deepEqual(table.header[0], [{ type: "text", value: "Table" }]);
  const escaped = parseMarkdown(
    "Before\n| Name | Meaning |\n| --- | --- |\n| `a|b` | x\\|y |\n\nAfter",
  );
  assert.deepEqual(
    escaped.map((block) => block.type),
    ["paragraph", "table", "paragraph"],
  );
  assert.deepEqual(escaped[1], {
    type: "table",
    header: [
      [{ type: "text", value: "Name" }],
      [{ type: "text", value: "Meaning" }],
    ],
    rows: [
      [[{ type: "code", value: "a|b" }], [{ type: "text", value: "x|y" }]],
    ],
  });
  const literal = parseMarkdown(
    "| Text |\n| --- |\n| <script>bad()</script> |",
  );
  assert.equal(literal[0].type, "table");
  assert.deepEqual(literal[0].type === "table" && literal[0].rows[0][0], [
    { type: "text", value: "<script>bad()</script>" },
  ]);
});

test("blocks: paragraphs, headings, lists, quotes and fenced code", () => {
  const blocks = parseMarkdown(
    [
      "The shop **customers** see.",
      "It is server-rendered.",
      "",
      "## Good fit if you",
      "",
      "- build UIs",
      "- know *some* TypeScript",
      "  and HTML",
      "",
      "1. first",
      "2. second",
      "",
      "> Ship it.",
      "",
      "```ts",
      "const x = 1;",
      "<b>not html</b>",
      "```",
    ].join("\n"),
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["paragraph", "heading", "list", "list", "quote", "code"],
  );
  assert.deepEqual(blocks[0], {
    type: "paragraph",
    children: [
      { type: "text", value: "The shop " },
      { type: "strong", children: [{ type: "text", value: "customers" }] },
      { type: "text", value: " see. It is server-rendered." },
    ],
  });
  const bullets = blocks[2] as Extract<
    (typeof blocks)[number],
    { type: "list" }
  >;
  assert.equal(bullets.ordered, false);
  assert.equal(bullets.items.length, 2);
  assert.deepEqual(bullets.items[1].at(-1), {
    type: "text",
    value: " TypeScript and HTML",
  });
  assert.equal((blocks[3] as { ordered: boolean }).ordered, true);
  assert.deepEqual(blocks[5], {
    type: "code",
    lang: "ts",
    value: "const x = 1;\n<b>not html</b>",
  });
});

test("inline: code protects its contents and snake_case is not italics", () => {
  assert.deepEqual(
    parseInline("Write `parse_csv_line(line)` for *each* line_item"),
    [
      { type: "text", value: "Write " },
      { type: "code", value: "parse_csv_line(line)" },
      { type: "text", value: " for " },
      { type: "em", children: [{ type: "text", value: "each" }] },
      { type: "text", value: " line_item" },
    ],
  );
  assert.deepEqual(parseInline("`**not bold**`"), [
    { type: "code", value: "**not bold**" },
  ]);
  for (const name of [
    "odd labels like __proto__.",
    "per_page=500",
    "__init__ and self.__dict__",
  ])
    assert.deepEqual(parseInline(name), [{ type: "text", value: name }], name);
});

test("links: only web and same-site targets become links", () => {
  assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
  assert.equal(safeHref("/challenges?q=kind:bug"), "/challenges?q=kind:bug");
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example",
    "JaVaScRiPt:x",
  ])
    assert.equal(safeHref(bad), null, bad);
  assert.deepEqual(parseInline("[docs](https://example.com)"), [
    {
      type: "link",
      href: "https://example.com",
      children: [{ type: "text", value: "docs" }],
    },
  ]);
  assert.deepEqual(parseInline("[click](javascript:alert(1))"), [
    { type: "text", value: "click" },
    { type: "text", value: ")" },
  ]);
});

test("raw HTML stays text and unclosed markers are left alone", () => {
  assert.deepEqual(parseMarkdown("<script>alert(1)</script>"), [
    {
      type: "paragraph",
      children: [{ type: "text", value: "<script>alert(1)</script>" }],
    },
  ]);
  assert.deepEqual(parseInline("2 * 3 = 6 and **open"), [
    { type: "text", value: "2 * 3 = 6 and **open" },
  ]);
  assert.deepEqual(parseMarkdown("```\nnever closed"), [
    { type: "code", lang: undefined, value: "never closed" },
  ]);
});
