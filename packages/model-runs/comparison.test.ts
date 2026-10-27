import { test } from "node:test";
import assert from "node:assert/strict";
import { codeRevision, toRecord } from "../domain/records";
import { modelParticipant } from "../domain/model";
import { canonical } from "../domain/json";
import { defaultComparisons, lengthDelta, codeLength } from "./comparison";
import { modelReceipt } from "./receipts";
import { receiptText, slot } from "./receipt-fixtures";
const revision = `sha256:${"a".repeat(64)}`;
function receipt(effort = "high", defaultEffort: string | null = "high") {
  return modelReceipt(
    { ...slot, condition: canonical({ reasoning: effort }) },
    receiptText((os) => {
      const start = os.find((o) => o.type === "model.run-started");
      start.data.request = {
        model: slot.model,
        ...(effort === "default" ? {} : { reasoning: { effort } }),
      };
      const last = os.filter((o) => o.type.startsWith("model.")).at(-1);
      os.push({
        ...last,
        type: "model.catalog",
        observationId: `${last.source.id}.${last.source.sequence + 1}`,
        source: { ...last.source, sequence: last.source.sequence + 1 },
        data: {
          at: "start",
          listing: {
            status: 200,
            entry: {
              id: slot.model,
              reasoning: { default_effort: defaultEffort },
            },
          },
        },
      });
    }),
    "JS-001",
    revision,
  );
}
test("one default per model, never medium by assumption or best observed outcome", () => {
  const high = receipt(),
    medium = receipt("medium");
  assert.equal(
    defaultComparisons([medium, high])[0].receipt?.reasoning,
    "high",
  );
  assert.equal(defaultComparisons([medium])[0].receipt, null);
  assert.equal(defaultComparisons([receipt("medium", null)])[0].receipt, null);
  const failed = { ...high, state: "error" as const };
  assert.equal(defaultComparisons([medium, failed])[0].receipt?.state, "error");
  assert.equal(
    defaultComparisons([{ ...high, try: 2 }, failed])[0].receipt?.state,
    "error",
  );
  assert.deepEqual(
    defaultComparisons([high, high]),
    defaultComparisons([high]),
  );
  assert.equal(defaultComparisons([high, failed])[0].receipt, null);
  assert.deepEqual(
    defaultComparisons([failed, high]),
    defaultComparisons([high, failed]),
  );
  assert.equal(
    defaultComparisons([receipt("default", null)])[0].receipt?.reasoning,
    "default",
  );
});
test("length deltas define model denominator/sign; zero and absent measurements are unavailable", () => {
  assert.equal(lengthDelta(80, 100), -20);
  assert.equal(lengthDelta(120, 100), 20);
  assert.equal(lengthDelta(100, 100), 0);
  assert.equal(lengthDelta(0, 100), -100);
  for (const model of [0, null, NaN, -1])
    assert.equal(lengthDelta(20, model), null);
  assert.equal(lengthDelta(null, 20), null);
});
test("only exact successful submitted artifact yields numeric code points, with no code in receipt", () => {
  const participant = modelParticipant(slot.model);
  const artifact = codeRevision(
    participant,
    "practice-synthetic",
    1,
    "practice-capture-1.2.0",
    { "fixture.js": { text: "SYNTHETIC_😀", mediaType: "text/javascript" } },
  );
  const base = receiptText((os) => {
    const submitted = os.find((o) => o.type === "practice.submitted");
    submitted.data.codeArtifactId = artifact.artifactId;
    submitted.data.revision = 1;
    os.find((o) => o.type === "practice.completed").data.codeArtifactId =
      artifact.artifactId;
  });
  const row = JSON.stringify({
    kind: "artifact",
    payload: toRecord(artifact).payload,
  });
  const projected = modelReceipt(slot, base + "\n" + row, "JS-001", revision);
  assert.equal(projected.finalCodeLength, 11);
  assert.doesNotMatch(JSON.stringify(projected), /SYNTHETIC_|fixture.js/);
  assert.equal(
    modelReceipt(slot, base, "JS-001", revision).finalCodeLength,
    null,
  );
  assert.equal(
    modelReceipt(slot, base + "\n" + row, "JS-001", `sha256:${"b".repeat(64)}`)
      .state,
    "incompatible",
  );
  assert.equal(codeLength({ ...artifact, truncated: true }, participant), null);
  assert.equal(codeLength(artifact, "different-owner"), null);
  const missing = receipt();
  assert.equal(missing.finalCodeLength, null);
});
