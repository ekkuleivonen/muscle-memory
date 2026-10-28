import { test } from "node:test";
import assert from "node:assert/strict";
import { codeRevision, toRecord } from "../domain/records";
import { modelParticipant } from "../domain/model";
import { canonical } from "../domain/json";
import {
  defaultComparisons,
  lengthDelta,
  codeLength,
  solvedLength,
} from "./comparison";
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

test("human length follows the latest successful submitted artifact, never later edits", () => {
  const participant = "synthetic-person";
  const make = (n: number, text: string) =>
    codeRevision(participant, "synthetic-source", n, "practice-capture-1.2.0", {
      "fixture.js": { text, mediaType: "text/javascript" },
    });
  const a = make(1, "first"),
    b = make(2, "latest"),
    edit = make(3, "later-unsubmitted");
  const observation = (type: string, sequence: number, data: any) => ({
    recordId: `synthetic-source.${sequence}`,
    participantId: participant,
    kind: "observation" as const,
    payload: JSON.stringify({
      type,
      actor: "person",
      participantId: participant,
      source: { id: "synthetic-source", sequence },
      occurredAt: "2026-10-27T00:00:00Z",
      challenge: "JS-900",
      challengeRevision: revision,
      attemptId: "attempt",
      data,
    }),
  });
  const passed = (runId: string, artifact: typeof a) => ({
    runId,
    revision: artifact.revision,
    codeArtifactId: artifact.artifactId,
    result: "passed",
    passed: 3,
    total: 3,
    rules: [],
  });
  const done = (runId: string, artifact: typeof a) => ({
    runId,
    codeArtifactId: artifact.artifactId,
  });
  const records = [
    toRecord(a),
    toRecord(b),
    toRecord(edit),
    observation("practice.submitted", 1, passed("a", a)),
    observation("practice.completed", 2, done("a", a)),
    observation("practice.submitted", 3, passed("b", b)),
    observation("practice.completed", 4, done("b", b)),
  ];
  assert.equal(solvedLength(records, "JS-900", revision, "attempt"), 6);
  assert.equal(solvedLength(records, "JS-900", revision, "different"), null);
  // Each provenance gap is unknown, never a length from some other code.
  const withSubmit = (data: any) => [
    ...records.slice(0, 5),
    observation("practice.submitted", 3, data),
    records[6],
  ];
  const { codeArtifactId: _id, ...noArtifact } = passed("b", b);
  for (const [why, rows] of [
    ["no artifact id", withSubmit(noArtifact)],
    ["artifact revision differs", withSubmit({ ...passed("b", b), revision: 1 })],
    ["a case failed", withSubmit({ ...passed("b", b), passed: 2 })],
    ["no cases", withSubmit({ ...passed("b", b), passed: 0, total: 0 })],
    ["a rule fired", withSubmit({ ...passed("b", b), rules: ["no-loops"] })],
    ["another artifact", withSubmit(passed("b", a))],
    [
      "conflicting submission copies",
      [...records, observation("practice.submitted", 3, { ...passed("b", b), total: 4, passed: 4 })],
    ],
    [
      "another challenge's submission",
      records.map((r, i) =>
        i === 5
          ? { ...r, payload: JSON.stringify({ ...JSON.parse(r.payload), challenge: "JS-901" }) }
          : r,
      ),
    ],
    [
      "a pre-actor submission",
      records.map((r, i) => {
        if (i !== 5) return r;
        const { actor: _a, ...rest } = JSON.parse(r.payload);
        return { ...r, payload: JSON.stringify(rest) };
      }),
    ],
    ["no code copy", records.filter((_, i) => i !== 1)],
  ] as const)
    assert.equal(solvedLength(rows as any, "JS-900", revision, "attempt"), null, why);
});

test("default provenance is per trial: a trial never borrows another trial's declared default", () => {
  const own = receipt("high", "high");
  const unproven = receipt("high", null);
  // Trial 1 has no declaration of its own; trial 2 declares high. Trial 1 is not a default run.
  const chosen = defaultComparisons([unproven, { ...own, try: 2 }])[0].receipt;
  assert.notEqual(chosen?.try, 1, "trial 1 not relabelled default");
  assert.equal(chosen?.try, 2, "only trial 2 carries its own default provenance");
  assert.equal(defaultComparisons([unproven])[0].receipt, null);
  assert.equal(defaultComparisons([own])[0].receipt?.try, 1);
});
