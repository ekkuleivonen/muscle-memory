import { test } from "node:test";
import assert from "node:assert/strict";
import { privateView } from "./private-view";
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
test("overlapping reads publish only the newest generation, including obsolete failures", async () => {
  const view = privateView<string>();
  const old = deferred<string>(),
    fresh = deferred<string>();
  const a = view.read(() => old.promise),
    b = view.read(() => fresh.promise);
  fresh.resolve("new");
  await b;
  old.resolve("old");
  await a;
  assert.equal(view.getSnapshot().value, "new");
  const error = deferred<string>();
  const c = view.read(() => error.promise);
  await view.read(async () => "newer");
  error.reject();
  await c;
  assert.deepEqual(view.getSnapshot(), {
    value: "newer",
    loading: false,
    error: false,
  });
});
test("reset invalidates synchronously, blocks reads while clearing, rejects pre-reset completion; failed reread cannot restore history", async () => {
  const view = privateView<string>();
  await view.read(async () => "sensitive");
  const pending = deferred<string>();
  const a = view.read(() => pending.promise);
  let observed: unknown;
  view.subscribe(() => {
    observed = view.getSnapshot().value;
  });
  view.invalidate(true);
  assert.equal(observed, null);
  assert.equal(view.getSnapshot().value, null);
  view.invalidate(); // Concurrent profile/progress notifications must not unblock a reset.
  let called = false;
  await view.read(async () => {
    called = true;
    return "pre-clear";
  });
  assert.equal(called, false);
  pending.resolve("obsolete sensitive history");
  await a;
  assert.equal(view.getSnapshot().value, null);
  view.release();
  await view.read(async () => {
    throw new Error("read failed after reset");
  });
  assert.deepEqual(view.getSnapshot(), {
    value: null,
    loading: false,
    error: true,
  });
});
test("ordinary refresh errors may retain clearly stale data; account/privacy boundary cannot", async () => {
  const view = privateView<string>();
  await view.read(async () => "private");
  await view.read(async () => {
    throw new Error();
  });
  assert.equal(view.getSnapshot().value, "private");
  assert.equal(view.getSnapshot().error, true);
  view.invalidate();
  await view.read(async () => {
    throw new Error();
  });
  assert.equal(view.getSnapshot().value, null);
});
