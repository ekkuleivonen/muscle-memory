import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHumanSnapshot, serveHumanSnapshot } from "./human-snapshot";
import { syntheticWindow } from "./cohort-fixtures";
import { syntheticRevision } from "../developer-profile/fixtures";
const runtime = { engine: "javascript", version: "synthetic" };
const spec = {
  challenge: "JS-001",
  revision: syntheticRevision,
  window: syntheticWindow,
  runtime,
};
const now = new Date(syntheticWindow.to);
const generation = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const rows = Array.from({ length: 20 }, (_, i) => ({
  participant_id: `synthetic-${i}`,
  runtime: JSON.stringify(runtime),
  editor: JSON.stringify({
    name: "CodeMirror",
    features: ["syntax-highlighting"],
  }),
  diagnostics: 0,
  practice: "first",
  completed: 1,
  first_pass: 1,
  submissions: 2,
}));
function control() {
  let value: string | null = generation;
  return {
    get current() {
      return value;
    },
    set current(v: string | null) {
      value = v;
    },
    generation: async () => value,
    check: async (ids: string[]) => ids.map(() => generation),
    authorize: async (candidate: string) => candidate === value,
  };
}
test("hourly handoff is aggregate-only; serving authorizes without SQL and strips unexpected artifact fields", async () => {
  const c = control();
  let queries = 0;
  const snapshot = await buildHumanSnapshot(
    spec,
    async () => {
      queries++;
      return rows;
    },
    c,
    now,
  );
  assert.ok(snapshot);
  assert.equal(queries, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /participant_id|synthetic-\d/);
  const dirty = {
    ...snapshot,
    secret: "synthetic-secret",
    code: "synthetic-code",
    groups: snapshot.groups.map((g) => ({
      ...g,
      participant_id: "synthetic-private",
    })),
  };
  const read = await serveHumanSnapshot(
    dirty,
    spec,
    c,
    new Date(now.getTime() + 1),
  );
  assert.equal(read?.groups.length, 1);
  assert.equal(queries, 1);
  assert.doesNotMatch(
    JSON.stringify(read),
    /secret|code|participant_id|synthetic-private/,
  );
});
test("missing, expired, invalidated or wrong revision snapshot omits the FYI; no stale fallback", async () => {
  const c = control();
  const snapshot = await buildHumanSnapshot(spec, async () => rows, c, now);
  assert.ok(snapshot);
  for (const artifact of [
    null,
    { ...snapshot, revision: `sha256:${"b".repeat(64)}` },
    { ...snapshot, expiresAt: now.toISOString() },
  ])
    assert.equal(await serveHumanSnapshot(artifact, spec, c, now), null);
  assert.equal(
    await serveHumanSnapshot(
      snapshot,
      spec,
      c,
      new Date(Date.parse(snapshot.expiresAt)),
    ),
    null,
  );
  c.current = crypto.randomUUID();
  assert.equal(await serveHumanSnapshot(snapshot, spec, c, now), null);
  c.current = null;
  assert.equal(await serveHumanSnapshot(snapshot, spec, c, now), null);
});
test("a change during precomputation rejects the artifact, including after the final member check", async () => {
  const c = control();
  let checks = 0;
  const snapshot = await buildHumanSnapshot(
    spec,
    async () => rows,
    {
      ...c,
      generation: c.generation,
      check: async (ids) => {
        if (++checks === 2) c.current = crypto.randomUUID();
        return ids.map(() => generation);
      },
    },
    now,
  );
  assert.equal(snapshot, null);
});
test("untrusted runtime/feature strings, malformed denominator or subset size never reaches the public FYI", async () => {
  const c = control();
  const snapshot = await buildHumanSnapshot(spec, async () => rows, c, now);
  assert.ok(snapshot);
  for (const group of [
    {
      ...snapshot.groups[0],
      runtime: { ...runtime, participant_id: "synthetic-secret" },
    },
    {
      ...snapshot.groups[0],
      editor: { name: "CodeMirror", features: ["synthetic-secret"] },
    },
    {
      ...snapshot.groups[0],
      denominators: { solved: "19", firstTry: "20–49", submissions: "20–49" },
    },
    { ...snapshot.groups[0], submissions: { p25: 3, p50: 2, p75: 1 } },
  ])
    assert.equal(
      await serveHumanSnapshot({ ...snapshot, groups: [group] }, spec, c, now),
      null,
    );
  const filtered = await buildHumanSnapshot(
    spec,
    async () =>
      rows.map((r) => ({
        ...r,
        runtime: JSON.stringify({ ...runtime, secret: "synthetic-secret" }),
      })),
    c,
    now,
  );
  assert.deepEqual(filtered?.groups, []);
});
