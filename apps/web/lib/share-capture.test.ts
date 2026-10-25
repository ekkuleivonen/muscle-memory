/**
 * The shared card in the site stream: `site.shared.card` is opaque JSON that names its own card
 * version (`card.v`). The validator and ingest never read it, so the card never chooses the
 * capture version, and ingest accepts the record whatever card it carries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE_CAPTURE_VERSION, siteRecord, siteShare } from "../../../packages/domain/site";
import { checkRecord } from "../../../packages/domain/ingest";
import type { StoredRecord } from "../../../packages/domain/records";
import { encodeOutcome, publicOutcome, type Outcome } from "./outcome";

const PARTICIPANT = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const REV = `sha256:${"d".repeat(64)}`;
let sequence = 0;
const common = () => ({
  participantId: PARTICIPANT,
  sessionId: "session-share-test",
  sourceId: "share-capture-test",
  sequence: ++sequence,
  occurredAt: `2026-10-25T12:00:${String(sequence).padStart(2, "0")}.000Z`,
  elapsedMs: sequence,
  termsVersion: "2026-10-01",
});
const v3: Outcome = {
  v: 3,
  k: "SQL-002",
  l: "sql",
  rv: "d".repeat(64),
  o: { passed: 15, total: 15 },
  f: { passed: 11, total: 15 },
  n: 3,
  c: "ab12cd34ef56",
};
const share = (card: unknown) =>
  siteShare({
    ...common(),
    challenge: { id: "collected-by-partner", revision: REV },
    data: {
      challengeKey: "SQL-002",
      channel: "copy",
      ref: "ab12cd34ef56",
      card: card as never,
    },
  });
const accepted = (record: StoredRecord) =>
  checkRecord(record, PARTICIPANT, "2026-10-25T12:30:00.000Z");
const under = (record: StoredRecord, version: string): StoredRecord => ({
  ...record,
  payload: JSON.stringify({ ...JSON.parse(record.payload), captureVersion: version }),
});

test("a card is recorded under the current site capture, unchanged, and ingest accepts it", () => {
  const shared = share(publicOutcome(v3));
  assert.equal(shared.captureVersion, SITE_CAPTURE_VERSION);
  assert.deepEqual(shared.data.card, v3);
  assert.equal(accepted(siteRecord(shared)).ok, true);
  // Exactly the card its link carries.
  assert.equal(
    Buffer.from(JSON.stringify(shared.data.card)).toString("base64url"),
    encodeOutcome(v3),
  );
  // An opaque card is opaque: an unknown card version is no reason to refuse the record.
  assert.equal(accepted(siteRecord(share({ v: 9 }))).ok, true);
});

test("a capture version ingest doesn't accept is refused, card or not", () => {
  assert.equal(
    accepted(under(siteRecord(share(publicOutcome(v3))), "site-capture-9.9.9")).ok,
    false,
  );
});
