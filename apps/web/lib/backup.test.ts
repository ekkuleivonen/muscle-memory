import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_KIND, BACKUP_VERSION, backupName, parseBackup, summarize } from "./backup";
import { PROFILE_KEY, PROFILE_VERSION } from "./profile";

const good = {
  kind: BACKUP_KIND,
  version: BACKUP_VERSION,
  exportedAt: "2026-10-25T10:00:00.000Z",
  local: {
    [PROFILE_KEY]: JSON.stringify({
      version: PROFILE_VERSION,
      createdAt: "2026-10-24T10:00:00.000Z",
      profile: {},
    }),
    "muscle-memory.stars": "[]",
  },
  store: {
    settings: { participantId: "p-1", deviceSecret: "s" },
    records: [{ recordId: "a.1", kind: "observation", participantId: "p-1", payload: "{}" }],
    outbox: ["a.1"],
  },
};

test("a backup reads back with what it holds", () => {
  const backup = parseBackup(JSON.stringify(good));
  assert.ok(!(backup instanceof Error));
  assert.deepEqual(summarize(backup), {
    participantId: "p-1",
    records: 1,
    exportedAt: "2026-10-25T10:00:00.000Z",
  });
});

test("anything else is refused with a reason, before it can replace anything", () => {
  const reasons = [
    "not json",
    JSON.stringify({ kind: "other" }),
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, local: { "other-site.key": "x" } }),
    JSON.stringify({ ...good, store: { ...good.store, records: [{ recordId: 1 }] } }),
    JSON.stringify({ ...good, store: { ...good.store, outbox: undefined } }),
  ].map((text) => parseBackup(text));
  for (const reason of reasons) assert.ok(reason instanceof Error, String(reason));
});

test("the file is named for the day", () => {
  assert.equal(backupName(new Date("2026-10-25T00:00:00Z")), "muscle-memory-backup-2026-10-25.json");
});
