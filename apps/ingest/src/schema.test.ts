import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkRecord } from "../../../packages/domain/ingest";
import { siteRecord, siteView } from "../../../packages/domain/site";

test("the events stream's schema has exactly the columns ingest writes", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../events.schema.json", import.meta.url), "utf8"),
  ) as { fields: { name: string }[] };
  const record = siteRecord(
    siteView({
      participantId: "participant-1",
      sessionId: "session-1",
      sourceId: "site-1",
      sequence: 1,
      occurredAt: "2026-10-26T10:00:00.000Z",
      elapsedMs: 1,
      termsVersion: "2026-10-26",
      data: { path: "/challenges", query: "", previous: null },
    }),
  );
  const verdict = checkRecord(record, "participant-1", "2026-10-26T10:00:01.000Z");
  assert.ok(verdict.ok);
  assert.deepEqual(
    schema.fields.map((f) => f.name),
    Object.keys(verdict.row),
  );
});
