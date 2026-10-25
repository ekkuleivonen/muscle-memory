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
  type BoardItem,
} from "./board";
import { library, summarize } from "./library";
import { catalog } from "./test-fixtures";

const issues = library(catalog).issues.map(summarize);

test("statuses set by hand round-trip through storage; Done is refused", () => {
  let items = setStatus([], "PHP-002", "todo", "2026-10-24T10:00:00Z");
  items = setStatus(items, "CPP-001", "in-progress", "2026-10-24T11:00:00Z");
  items = setStatus(items, "PHP-002", "in-progress", "2026-10-24T12:00:00Z");
  assert.deepEqual(
    items.map((i) => [i.key, i.status, i.addedAt]),
    [
      ["PHP-002", "in-progress", "2026-10-24T10:00:00Z"],
      ["CPP-001", "in-progress", "2026-10-24T11:00:00Z"],
    ],
  );
  assert.deepEqual(parseBoard(serializeBoard(items)), items);
  assert.deepEqual(
    setStatus(items, "PHP-002", "backlog", "t").map((i) => i.key),
    ["CPP-001"],
  );
  assert.equal(statusOf(items, "CPP-001"), "in-progress");
  assert.equal(statusOf(items, "JS-003"), "backlog");
  assert.throws(() => setStatus(items, "PHP-002", "done" as never, "t"), /Done/);
});

test("boards saved before statuses existed read as Todo", () => {
  assert.deepEqual(
    parseBoard(JSON.stringify({ items: [{ key: "PHP-002", addedAt: "x" }] })),
    [{ key: "PHP-002", addedAt: "x", status: "todo" }],
  );
  assert.deepEqual(
    parseBoard(
      JSON.stringify({
        items: [{ key: "PHP-002", addedAt: "x", status: "done" }],
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
          { key: "PHP-002", addedAt: "x" },
          { key: "PHP-002", addedAt: "y" },
          { key: "<script>", addedAt: "x" },
          { key: "TS-004" },
          null,
        ],
      }),
    ),
    [{ key: "PHP-002", addedAt: "x", status: "todo" }],
  );
});

test("the soft limit starts at three on the board", () => {
  const two = ["GO-002", "PHP-002"].reduce<BoardItem[]>(
    (all, key) => setStatus(all, key, "todo", "t"),
    [],
  );
  assert.equal(boardFull(two), false);
  assert.equal(boardFull(setStatus(two, "TS-004", "in-progress", "t")), true);
});

test("the board keeps the order issues were added and skips ones that no longer exist", () => {
  const items: BoardItem[] = [
    { key: "CPP-001", addedAt: "a", status: "in-progress" },
    { key: "GONE-1", addedAt: "b", status: "todo" },
    { key: "PY-002", addedAt: "c", status: "todo" },
  ];
  assert.deepEqual(
    boardIssues(items, issues).map(({ issue, status }) => [issue.key, status]),
    [
      ["CPP-001", "in-progress"],
      ["PY-002", "todo"],
    ],
  );
});

test("a run passing every check moves an issue to Done, for good", () => {
  const items = setStatus([], "PY-002", "in-progress", "t1");
  const done = complete(items, "PY-002", "t2");
  assert.deepEqual(done, [
    { key: "PY-002", addedAt: "t1", status: "done", doneAt: "t2" },
  ]);
  // Done straight from the backlog joins the board as done.
  assert.deepEqual(complete([], "PHP-002", "t3"), [
    { key: "PHP-002", addedAt: "t3", status: "done", doneAt: "t3" },
  ]);
  // It stays done: passing again, or choosing a status by hand, changes nothing.
  assert.deepEqual(complete(done, "PY-002", "t9"), done);
  assert.deepEqual(setStatus(done, "PY-002", "todo", "t9"), done);
  assert.deepEqual(setStatus(done, "PY-002", "backlog", "t9"), done);
  assert.equal(statusOf(done, "PY-002"), "done");
  // Stored and read back, including when it was done.
  assert.deepEqual(parseBoard(serializeBoard(done)), done);
  assert.deepEqual(
    parseBoard(
      JSON.stringify({
        items: [{ key: "PY-002", addedAt: "t", status: "done" }],
      }),
    ),
    [],
  );
});

test("done issues leave the queue: they never count toward the soft limit", () => {
  let items = ["JS-003", "TS-002", "HTML-001"].reduce(
    (acc, key) => setStatus(acc, key, "todo", "t"),
    [] as ReturnType<typeof setStatus>,
  );
  assert.equal(boardFull(items), true);
  items = complete(items, "JS-003", "t2");
  assert.equal(activeCount(items), 2);
  assert.equal(boardFull(items), false);
});
