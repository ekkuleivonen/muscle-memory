import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPinned } from "./runner";
const pinned = {
  files: { "runtime.js": "sha256-fixture" },
  sizes: { "runtime.js": 2 },
};
const base = new URL("https://qa.invalid/runtime/");
test("healthy SRI fetch may withhold its response past thirty seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    assert.equal(options.integrity, "sha256-fixture");
    return new Promise<Response>((resolve, reject) => {
      options.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
      setTimeout(() => resolve(new Response("ok")), 35_000);
    });
  });
  const pending = loadPinned(pinned, base);
  t.mock.timers.tick(35_001);
  const files = await pending;
  assert.equal(new TextDecoder().decode(files["runtime.js"]), "ok");
});
test("a hanging integrity fetch has a total deadline and a later retry can succeed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    assert.equal(options.integrity, "sha256-fixture");
    if (++calls > 1) return Promise.resolve(new Response("ok"));
    return new Promise((_resolve, reject) =>
      options.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      ),
    );
  });
  const pending = loadPinned(pinned, base, undefined, {
    downloadTimeoutMs: 50,
  });
  const rejected = assert.rejects(pending, /download exceeded/);
  t.mock.timers.tick(51);
  await rejected;
  assert.equal(
    new TextDecoder().decode((await loadPinned(pinned, base))["runtime.js"]),
    "ok",
  );
});
