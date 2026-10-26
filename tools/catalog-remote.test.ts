import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteCatalog } from "./catalog-remote";
const target = {
  account: "a".repeat(32),
  database: "a".repeat(8) + "-aaaa-aaaa-aaaa-" + "a".repeat(12),
  bucket: "muscle-memory-content",
};
test("remote seed pins targets and transmits one parameterized D1 batch", async () => {
  const calls: any[] = [];
  const remote = remoteCatalog(target, "Bearer fixture", async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      success: true,
      result: [
        { success: true, results: [] },
        { success: true, results: [] },
      ],
    });
  });
  await remote.db.batch([
    remote.db.prepare("INSERT INTO x VALUES (?)").bind("private"),
    remote.db.prepare("SELECT 1"),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    batch: [
      { sql: "INSERT INTO x VALUES (?)", params: ["private"] },
      { sql: "SELECT 1", params: [] },
    ],
  });
  assert.throws(() =>
    remoteCatalog({ ...target, bucket: "research" }, "fixture"),
  );
});
test("remote object path is encoded and existing data is never overwritten", async () => {
  let writes = 0;
  const map = new Map<string, string>();
  const remote = remoteCatalog(target, "Bearer fixture", async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "PUT") {
      writes++;
      assert.equal(new Headers(init.headers).get("if-none-match"), "*");
      map.set(path, String(init.body));
      return new Response("ok");
    }
    return map.has(path)
      ? new Response(map.get(path))
      : new Response("", { status: 404 });
  });
  await remote.bucket.put("private/a.json", "original", {
    onlyIf: { etagDoesNotMatch: "*" },
  });
  assert.equal(
    await remote.bucket.put("private/a.json", "changed", {
      onlyIf: { etagDoesNotMatch: "*" },
    }),
    null,
  );
  assert.equal(writes, 1);
  assert.equal(
    await (await remote.bucket.get("private/a.json"))!.text(),
    "original",
  );
});
test("remote uncertain errors are not automatically retried or printed with private bodies", async () => {
  let calls = 0;
  const remote = remoteCatalog(target, "Bearer fixture", async () => {
    calls++;
    return Response.json(
      { success: false, errors: [{ code: 10000, message: "private source" }] },
      { status: 403 },
    );
  });
  await assert.rejects(
    remote.db.batch([remote.db.prepare("private sql")]),
    (e) => /403/.test(String(e)) && !/private/.test(String(e)),
  );
  assert.equal(calls, 1);
});
