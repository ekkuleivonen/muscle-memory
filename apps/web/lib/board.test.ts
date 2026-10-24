import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeCount,
  boardIssues,
  boardFull,
  complete,
  parseBoard,
  serializeBoard,
  setStatus,
  statusOf,
  suggestions,
  type BoardItem,
} from "./board";
import { library, summarize } from "./library";
import { catalog } from "./test-fixtures";

const issues = library(catalog).issues.map(summarize);

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
  // Issues that run in the browser come first, easiest first.
  assert.deepEqual(
    suggestions(issues, [], ["rust"]).map((i) => i.key),
    ["FN-1", "SHOP-1", "SHOP-3"],
  );
  const runnable = issues.filter((i) => i.runnable).map((i) => i.key);
  const runnableOnBoard = runnable.map((key) => ({
    key,
    addedAt: "t",
    status: "todo" as const,
  }));
  assert.deepEqual(
    suggestions(issues, runnableOnBoard, ["cpp"]).map((i) => i.key),
    [],
  );
  // With only the C and C++ issues left, the person's C++ comes first.
  const allButC = runnableOnBoard.filter(
    (item) => item.key !== "EDGE-1" && item.key !== "EDGE-3",
  );
  assert.deepEqual(
    suggestions(issues, allButC, ["cpp"]).map((i) => i.key),
    ["EDGE-3", "EDGE-1"],
  );
  // Among runnable issues not on the board, the person's languages come first.
  const notGo = issues
    .filter((i) => i.runnable && i.language !== "go")
    .map((key) => ({ key: key.key, addedAt: "t", status: "todo" as const }));
  assert.deepEqual(
    suggestions(issues, notGo, ["go"], 2).map((i) => i.key),
    ["API-1", "API-4"],
  );
});

test("a run passing every check moves an issue to Done, for good", () => {
  const items = setStatus([], "FN-1", "in-progress", "t1");
  const done = complete(items, "FN-1", "t2");
  assert.deepEqual(done, [
    { key: "FN-1", addedAt: "t1", status: "done", doneAt: "t2" },
  ]);
  // Done straight from the backlog joins the board as done.
  assert.deepEqual(complete([], "API-2", "t3"), [
    { key: "API-2", addedAt: "t3", status: "done", doneAt: "t3" },
  ]);
  // It stays done: passing again, or choosing a status by hand, changes nothing.
  assert.deepEqual(complete(done, "FN-1", "t9"), done);
  assert.deepEqual(setStatus(done, "FN-1", "todo", "t9"), done);
  assert.deepEqual(setStatus(done, "FN-1", "backlog", "t9"), done);
  assert.equal(statusOf(done, "FN-1"), "done");
  // Stored and read back, including when it was done.
  assert.deepEqual(parseBoard(serializeBoard(done)), done);
  assert.deepEqual(
    parseBoard(
      JSON.stringify({
        items: [{ key: "FN-1", addedAt: "t", status: "done" }],
      }),
    ),
    [],
  );
});

test("done issues leave the queue: they never count toward the soft limit", () => {
  let items = ["SHOP-1", "SHOP-2", "SHOP-3"].reduce(
    (acc, key) => setStatus(acc, key, "todo", "t"),
    [] as ReturnType<typeof setStatus>,
  );
  assert.equal(boardFull(items), true);
  items = complete(items, "SHOP-1", "t2");
  assert.equal(activeCount(items), 2);
  assert.equal(boardFull(items), false);
});
