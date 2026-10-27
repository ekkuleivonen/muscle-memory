import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { privateView } from "../../../packages/developer-profile/private-view";
import { openPracticeStore } from "../../../packages/browser/practice-store";
import { trace } from "../../../packages/developer-profile/fixtures";
import { resetProgress } from "./account";
import { listenPrivateBoundary } from "./private-boundary";
import { PROGRESS_CHANGE, PROGRESS_KEY } from "./progress";
test("real reset boundary clears a live view before storage work and cannot preserve it after a failed reread", async () => {
  const target = new EventTarget();
  const local = new Map<string, string>([[PROGRESS_KEY, "synthetic progress"]]);
  const previous = {
    window: globalThis.window,
    indexedDB: globalThis.indexedDB,
    localStorage: globalThis.localStorage,
  };
  Object.assign(globalThis, {
    window: target,
    indexedDB: new IDBFactory(),
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => local.set(k, v),
      removeItem: (k: string) => local.delete(k),
    },
  });
  const view = privateView<string>();
  let release!: (s: string) => void;
  const stop = listenPrivateBoundary((phase) =>
    phase === "start" ? view.invalidate(true) : view.release(),
  );
  const reread = () => {
    view.invalidate();
    void view.read(async () => {
      throw new Error("synthetic failed reread");
    });
  };
  target.addEventListener(PROGRESS_CHANGE, reread);
  try {
    const store = await openPracticeStore();
    await store.restore({
      settings: {
        participantId: "synthetic-participant",
        deviceSecret: "synthetic-device-secret",
      },
      records: trace(),
      outbox: [],
    });
    store.close();
    await view.read(async () => "sensitive snapshot");
    const pending = view.read(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    const reset = resetProgress();
    assert.equal(
      view.getSnapshot().value,
      null,
      "cleared synchronously before awaiting reset",
    );
    await reset;
    release("obsolete sensitive snapshot");
    await pending;
    await Promise.resolve();
    assert.equal(view.getSnapshot().value, null);
    assert.equal(view.getSnapshot().error, true);
    const after = await openPracticeStore();
    const dump = await after.dump();
    after.close();
    assert.equal(dump.records.length, 0);
    assert.equal(dump.settings.deviceSecret, "synthetic-device-secret");
    assert.equal(local.has(PROGRESS_KEY), false);
  } finally {
    stop();
    target.removeEventListener(PROGRESS_CHANGE, reread);
    Object.assign(globalThis, previous);
  }
});
