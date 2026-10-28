import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceActor, PRACTICE_CAPTURE_VERSION } from "./practice";

const LEGACY = ["practice-capture-1.0.0", "practice-capture-1.1.0"];
const terms = "2026-10-25.1";
const schemaVersion = "1.0.0";

test("current records are what they say: a person or a model, nothing else, never missing", () => {
  const v = PRACTICE_CAPTURE_VERSION;
  assert.equal(practiceActor({ schemaVersion, captureVersion: v, actor: "person", termsVersion: terms }), "person");
  assert.equal(practiceActor({ captureVersion: v, actor: "model", termsVersion: null }), "model");
  assert.equal(practiceActor({ captureVersion: v, termsVersion: terms }), null, "1.2.0 always names its actor");
  for (const actor of [null, "", "Person", "system", "human", 1, {}])
    assert.equal(practiceActor({ captureVersion: v, actor, termsVersion: terms }), null, String(actor));
});

test("a pre-actor capture is a person's only in its one historic form", () => {
  for (const captureVersion of LEGACY) {
    assert.equal(practiceActor({ schemaVersion, captureVersion, termsVersion: terms }), "person", captureVersion);
    assert.equal(practiceActor({ schemaVersion, captureVersion, termsVersion: "2026-10-25" }), "person");
    // Every pre-actor envelope wrote schema 1.0.0; ingest never checked it, so the reader does.
    for (const schema of [undefined, null, "", "2.0.0", "1.0", 1])
      assert.equal(practiceActor({ schemaVersion: schema, captureVersion, termsVersion: terms }), null, `schema ${String(schema)}`);
    // Every pre-actor envelope carried a dated Terms version.
    for (const termsVersion of [undefined, null, "", "latest", 20261025])
      assert.equal(practiceActor({ schemaVersion, captureVersion, termsVersion }), null, String(termsVersion));
    // No pre-actor envelope ever had an actor key: one that does is not that format.
    for (const actor of ["person", "model", null, "system"])
      assert.equal(practiceActor({ schemaVersion, captureVersion, actor, termsVersion: terms }), null, `${captureVersion} ${actor}`);
  }
});

test("an actorless record of an unknown or malformed version never defaults to a person", () => {
  for (const captureVersion of [undefined, null, "", "practice-capture-0.9.0", "practice-capture-1.1", "practice-capture-1.1.0 ", "site-capture-1.0.0", 110])
    assert.equal(practiceActor({ schemaVersion, captureVersion, termsVersion: terms }), null, String(captureVersion));
  // An explicit actor on a version other than 1.0.0/1.1.0 is kept as it says; derive flags the version.
  assert.equal(practiceActor({ schemaVersion, captureVersion: "practice-capture-0.9.0", actor: "person", termsVersion: terms }), "person");
});
