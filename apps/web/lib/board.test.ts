import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import {
  boardIssues,
  boardFull,
  parseBoard,
  serializeBoard,
  setStatus,
  statusOf,
  suggestions,
  type BoardItem,
} from "./board";
import { library, summarize } from "./library";

const read = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../content/${path}`, import.meta.url), "utf8"),
  ) as Catalog;
const reference = read("catalog/reference.v1.json");
const demo = read("demo/catalog.json");
const issues = library({
  ...reference,
  entries: { ...reference.entries, ...demo.entries },
}).issues.map(summarize);

test("statuses set by hand round-trip through storage; Done is refused", () => {
  let items = setStatus([], "API-2", "todo", "2026-10-24T10:00:00Z");
  items = setStatus(items, "EDGE-3", "in-progress", "2026-10-24T11:00:00Z");
  items = setStatus(items, "API-2", "in-progress", "2026-10-24T12:00:00Z");
  assert.deepEqual(
    items.map((i) => [i.key, i.status, i.addedAt]),
    [
      ["API-2", "in-progress", "2026-10-24T10:00:00Z"],
      ["EDGE-3", "in-progress", "2026-10-24T11:00:00Z"],
    ],
  );
  assert.deepEqual(parseBoard(serializeBoard(items)), items);
  assert.deepEqual(
    setStatus(items, "API-2", "backlog", "t").map((i) => i.key),
    ["EDGE-3"],
  );
  assert.equal(statusOf(items, "EDGE-3"), "in-progress");
  assert.equal(statusOf(items, "SHOP-1"), "backlog");
  assert.throws(() => setStatus(items, "API-2", "done" as never, "t"), /Done/);
});

test("boards saved before statuses existed read as Todo", () => {
  assert.deepEqual(
    parseBoard(JSON.stringify({ items: [{ key: "API-2", addedAt: "x" }] })),
    [{ key: "API-2", addedAt: "x", status: "todo" }],
  );
  assert.deepEqual(
    parseBoard(
      JSON.stringify({
        items: [{ key: "API-2", addedAt: "x", status: "done" }],
      }),
    ),
    [],
  );
});

test("malformed or tampered storage is ignored, not trusted", () => {
  for (const raw of [null, "", "{", "[]", '{"items":{}}'])
    assert.deepEqual(parseBoard(raw), []);
  assert.deepEqual(
    parseBoard(
      JSON.stringify({
        items: [
          { key: "API-2", addedAt: "x" },
          { key: "API-2", addedAt: "y" },
          { key: "<script>", addedAt: "x" },
          { key: "API-3" },
          null,
        ],
      }),
    ),
    [{ key: "API-2", addedAt: "x", status: "todo" }],
  );
});

test("the soft limit starts at three on the board", () => {
  const two = ["API-1", "API-2"].reduce<BoardItem[]>(
    (all, key) => setStatus(all, key, "todo", "t"),
    [],
  );
  assert.equal(boardFull(two), false);
  assert.equal(boardFull(setStatus(two, "API-3", "in-progress", "t")), true);
});

test("the board keeps the order issues were added and skips ones that no longer exist", () => {
  const items: BoardItem[] = [
    { key: "EDGE-3", addedAt: "a", status: "in-progress" },
    { key: "GONE-1", addedAt: "b", status: "todo" },
    { key: "FN-1", addedAt: "c", status: "todo" },
  ];
  assert.deepEqual(
    boardIssues(items, issues).map(({ issue, status }) => [issue.key, status]),
    [
      ["EDGE-3", "in-progress"],
      ["FN-1", "todo"],
    ],
  );
});

test("suggestions prefer runnable, then the person's stack, then easier issues", () => {
  assert.deepEqual(
    suggestions(issues, [], ["rust"]).map((i) => i.key),
    ["FN-1", "EDGE-4", "EDGE-2"],
  );
  assert.deepEqual(
    suggestions(
      issues,
      [{ key: "FN-1", addedAt: "t", status: "todo" }],
      ["go"],
      2,
    ).map((i) => i.key),
    ["API-1", "API-4"],
  );
});
