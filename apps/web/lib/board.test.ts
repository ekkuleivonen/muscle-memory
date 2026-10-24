import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import {
  boardIssues,
  moveToBacklog,
  moveToTodo,
  parseBoard,
  serializeBoard,
  statusOf,
  suggestions,
  todoFull,
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

test("moving issues between backlog and Todo round-trips through storage", () => {
  let items = moveToTodo([], "API-2", "2026-10-24T10:00:00Z");
  items = moveToTodo(items, "API-2", "2026-10-24T11:00:00Z");
  items = moveToTodo(items, "EDGE-3", "2026-10-24T12:00:00Z");
  assert.deepEqual(
    items.map((i) => i.key),
    ["API-2", "EDGE-3"],
  );
  assert.equal(items[0].addedAt, "2026-10-24T10:00:00Z");
  assert.deepEqual(parseBoard(serializeBoard(items)), items);
  assert.deepEqual(
    moveToBacklog(items, "API-2").map((i) => i.key),
    ["EDGE-3"],
  );
  assert.equal(statusOf(items, "EDGE-3"), "todo");
  assert.equal(statusOf(items, "SHOP-1"), "backlog");
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
    [{ key: "API-2", addedAt: "x" }],
  );
});

test("the soft limit starts at three in Todo", () => {
  const two = ["API-1", "API-2"].reduce<BoardItem[]>(
    (all, key) => moveToTodo(all, key, "t"),
    [],
  );
  assert.equal(todoFull(two), false);
  assert.equal(todoFull(moveToTodo(two, "API-3", "t")), true);
});

test("the board keeps the order issues were added and skips ones that no longer exist", () => {
  const items = [
    { key: "EDGE-3", addedAt: "a" },
    { key: "GONE-1", addedAt: "b" },
    { key: "FN-1", addedAt: "c" },
  ];
  assert.deepEqual(
    boardIssues(items, issues).map(({ issue, status }) => [issue.key, status]),
    [
      ["EDGE-3", "todo"],
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
    suggestions(issues, [{ key: "FN-1", addedAt: "t" }], ["go"], 2).map(
      (i) => i.key,
    ),
    ["API-1", "API-4"],
  );
});
