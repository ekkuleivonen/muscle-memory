import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PrivacyController,
  type PrivacyReply,
  type PrivacySnapshot,
  type RemotePrivacy,
} from "./comparison-privacy-controller";
const local: PrivacySnapshot = {
  participant: "synthetic-browser",
  stealth: false,
  age: "adult",
};
const remote: RemotePrivacy = {
  stealth: false,
  age: "adult",
  revision: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
};
const restrictive: RemotePrivacy = {
  ...remote,
  stealth: true,
  revision: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
};
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("reload observes without enrolling; stale tab save uses old revision and requires explicit review", async () => {
  let current: RemotePrivacy | null = remote;
  const writes: (string | null)[] = [];
  const c = new PrivacyController({
    read: async () => ({ status: "ok", value: current }),
    update: async (value, expected) => {
      writes.push(expected);
      if (current?.revision !== expected) return { status: "conflict" };
      current = {
        stealth: value.stealth,
        age: value.age,
        revision: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      };
      return { status: "ok", value: current };
    },
  });
  await c.observe(local);
  assert.equal(c.getSnapshot().status, "confirmed");
  assert.equal(writes.length, 0);
  current = restrictive; // Another tab's server-acknowledged stealth.
  await c.save(local);
  assert.deepEqual(writes, [remote.revision]);
  assert.equal(c.getSnapshot().status, "conflict");
  assert.equal(current.stealth, true, "no read-and-overwrite conflict retry");
  await c.applyReviewed(local);
  assert.deepEqual(writes, [remote.revision, restrictive.revision]);
  assert.equal(c.getSnapshot().status, "confirmed");
});
test("offline/pending retry reads confirmation after a lost successful write without rewriting", async () => {
  let current: RemotePrivacy | null = null,
    online = false,
    writes = 0;
  const c = new PrivacyController({
    read: async () =>
      online ? { status: "ok", value: current } : { status: "pending" },
    update: async () => {
      writes++;
      current = restrictive;
      return { status: "pending" };
    },
  });
  await c.save({ ...local, stealth: true });
  assert.equal(c.getSnapshot().status, "pending");
  await c.observe({ ...local, stealth: true });
  assert.equal(c.getSnapshot().status, "pending");
  online = true;
  await c.observe({ ...local, stealth: true });
  assert.equal(c.getSnapshot().status, "confirmed");
  assert.equal(writes, 1);
});
test("old responses cannot confirm a new preference or cross reset/delete/import identity boundaries", async () => {
  const pending = deferred<PrivacyReply>();
  const c = new PrivacyController({
    read: async () => ({ status: "ok", value: remote }),
    update: async () => pending.promise,
  });
  await c.observe(local);
  const old = c.save(local);
  c.clear(); // reset/delete/import/logout invalidation; no old remote baseline survives
  await c.observe({
    ...local,
    participant: "replacement-browser",
    stealth: true,
  });
  pending.resolve({ status: "ok", value: remote });
  await old;
  assert.equal(c.getSnapshot().local?.participant, "replacement-browser");
  assert.equal(c.getSnapshot().status, "conflict");
});
test("overlapping read/save completion cannot restore obsolete confirmation", async () => {
  const late = deferred<PrivacyReply>();
  let reads = 0;
  const c = new PrivacyController({
    read: async () =>
      ++reads === 1 ? late.promise : { status: "ok", value: restrictive },
    update: async () => ({ status: "pending" }),
  });
  const old = c.observe(local);
  await c.observe({ ...local, stealth: true });
  late.resolve({ status: "ok", value: remote });
  await old;
  assert.equal(c.getSnapshot().local?.stealth, true);
  assert.equal(c.getSnapshot().remote?.revision, restrictive.revision);
});
test("changed preference must be reviewed again; deleted and disabled do not publish confirmation", async () => {
  let writes = 0;
  const c = new PrivacyController({
    read: async () => ({ status: "ok", value: restrictive }),
    update: async () => {
      writes++;
      return { status: "pending" };
    },
  });
  await c.observe(local);
  await c.applyReviewed({ ...local, age: "unknown" });
  assert.equal(writes, 0);
  const deleted = new PrivacyController({
    read: async () => ({ status: "deleted" }),
    update: async () => ({ status: "deleted" }),
  });
  await deleted.observe(local);
  assert.equal(deleted.getSnapshot().status, "deleted");
  const disabled = new PrivacyController(
    {
      read: async () => assert.fail("disabled read"),
      update: async () => assert.fail("disabled write"),
    },
    false,
  );
  await disabled.observe(local);
  await disabled.save(local);
  assert.equal(disabled.getSnapshot().status, "disabled");
});
test("provisional matching state stays pending, and provisional different preferences still require review", async () => {
  let updates = 0;
  const c = new PrivacyController({
    read: async () => ({ status: "pending", value: restrictive }),
    update: async () => {
      updates++;
      return { status: "ok", value: restrictive };
    },
  });
  await c.observe({ ...local, stealth: true });
  assert.equal(c.getSnapshot().status, "pending");
  await c.observe(local);
  assert.equal(c.getSnapshot().status, "conflict");
  assert.equal(updates, 0);
});
test("retrying a conflict only rereads; only the review action can use the newly observed revision", async () => {
  let writes = 0;
  const c = new PrivacyController({
    read: async () => ({ status: "ok", value: restrictive }),
    update: async () => {
      writes++;
      return { status: "pending" };
    },
  });
  await c.observe(local);
  await c.retry(local);
  assert.equal(writes, 0);
  assert.equal(c.getSnapshot().status, "conflict");
  await c.applyReviewed(local);
  assert.equal(writes, 1);
});
test("a browser the server never recorded is unshared: reloads never enroll, the explicit action creates it once", async () => {
  let current: RemotePrivacy | null = null;
  const writes: (string | null)[] = [];
  const c = new PrivacyController({
    read: async () => ({ status: "ok", value: current }),
    update: async (value, expected) => {
      writes.push(expected);
      if ((current?.revision ?? null) !== expected) return { status: "conflict" };
      current = { stealth: value.stealth, age: value.age, revision: "dddddddd-dddd-dddd-dddd-dddddddddddd" };
      return { status: "ok", value: current };
    },
  });
  await c.observe(local);
  await c.observe(local);
  await c.retry(local);
  assert.equal(c.getSnapshot().status, "unshared");
  assert.deepEqual(writes, [], "observing and retrying never write");
  await c.applyReviewed(local);
  assert.deepEqual(writes, [null], "create only if still absent");
  assert.equal(c.getSnapshot().status, "confirmed");
  // A record created meanwhile elsewhere makes the create-if-absent write conflict, not overwrite.
  current = null;
  await c.observe(local);
  current = restrictive;
  await c.applyReviewed(local);
  assert.equal(c.getSnapshot().status, "conflict");
  assert.equal(current, restrictive);
});
