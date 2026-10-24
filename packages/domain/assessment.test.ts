import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assess,
  canonical,
  encounter,
  parseOutputs,
  snapshot,
  type Challenge,
  type Adventure,
  type Attempt,
} from "./assessment";
const challenge: Challenge = {
  id: "tally",
  version: "1.0.0",
  assessment_version: "1.0.0",
  task: "Count labels",
  skills: ["maps"],
  hints: ["Use a map"],
  inputs: [["a"], []],
  expected: [{ a: 1 }, {}],
};
const adventure: Adventure = {
  id: "notebook",
  version: "1.0.0",
  story: "Count field notes",
  presentation: "text-v1",
  challenges: [["tally", "1.0.0"]],
};
function attempt(): Attempt {
  return {
    id: "attempt-1",
    participantId: "participant-1",
    challengeId: challenge.id,
    challengeVersion: challenge.version,
    challengeSnapshot: snapshot(challenge),
    encounter: encounter(adventure),
    outputs: [{ a: 1 }, {}],
    assistance: "unaided",
    hintsShown: [],
    startedAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-01-01T00:01:00Z",
    activeSeconds: 30,
    consentVersion: "local-v1",
  };
}
test("reproducible feedback retains exact assessment version", () => {
  const result = assess(challenge, attempt());
  assert.equal(result.correctness, 1);
  assert.equal(result.assessmentVersion, "1.0.0");
  assert.equal(result.provisional, true);
  assert.deepEqual(result, assess(challenge, attempt()));
  assert.equal(
    assess(challenge, { ...attempt(), outputs: [{ a: 2 }, {}] }).correctness,
    0.5,
  );
  assert.equal(
    assess(challenge, { ...attempt(), outputs: [{ a: true }, {}] }).correctness,
    0.5,
  );
});
test("changed content and encounter order are rejected", () => {
  assert.throws(
    () => assess({ ...challenge, task: "Different" }, attempt()),
    /changed/,
  );
  assert.throws(
    () =>
      assess(challenge, {
        ...attempt(),
        encounter: { ...encounter(adventure), position: 2 },
      }),
    /order/,
  );
  assert.throws(
    () => assess(challenge, { ...attempt(), consentVersion: "" }),
    /Consent/,
  );
  assert.throws(
    () => assess(challenge, { ...attempt(), activeSeconds: 61 }),
    /time/,
  );
});
test("parses bounded JSON outputs and canonical object keys", () => {
  assert.deepEqual(parseOutputs('[{"b":2,"a":1}]'), [{ b: 2, a: 1 }]);
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.throws(() => parseOutputs("{}"), /array/);
  assert.throws(() => parseOutputs("bad"), /valid JSON/);
  assert.throws(() => parseOutputs(" ".repeat(65537)), /64 KiB/);
});

test("canonical JSON omits undefined properties and rejects other undefined values", () => {
  assert.equal(canonical({ b: 1, a: undefined } as never), '{"b":1}');
  assert.throws(() => canonical([undefined] as never), /JSON/);
  assert.throws(() => canonical(undefined as never), /JSON/);
});
