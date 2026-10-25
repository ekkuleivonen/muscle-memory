import { test } from "node:test";
import assert from "node:assert/strict";
import { publishProblems } from "./publish";
import { readChallenges } from "./source";

const challenges = readChallenges(new URL("../../content/challenges", import.meta.url).pathname);
const of = (key: string) => challenges.find((c) => c.metadata.key === key)!;

test("every challenge passes the publish checks", () => {
  assert.ok(challenges.length >= 2);
  for (const { metadata, revision, private: secret } of challenges)
    assert.deepEqual(publishProblems(revision, secret), [], metadata.key);
});

test("a rule needs examples both ways, and must not fire on a correct solution", () => {
  const { revision, private: secret } = of("JS-005");
  const [id] = revision.rules.map((r) => r.id);
  const { [id]: _, ...others } = secret.examples;
  assert.deepEqual(publishProblems(revision, { ...secret, examples: others }), [
    `rule ${id} needs examples that fire it and that do not`,
  ]);
  const firing = secret.examples[id].fires[0];
  assert.deepEqual(
    publishProblems(revision, {
      ...secret,
      solution: firing,
      examples: { ...secret.examples, [id]: { fires: [firing], quiet: [firing] } },
    }),
    [`${id}: quiet example 1 fires it`, `rule ${id} fires on the solution`],
  );
});

test("every challenge shows its checks accept other designs and catch mistakes", () => {
  for (const key of ["PY-002", "CPP-002", "SQL-003"]) {
    const { revision, private: secret } = of(key);
    assert.deepEqual(publishProblems(revision, { ...secret, alternatives: [], wrong: [] }), [
      "no alternative: name another correct design the checks accept",
      "fewer than two wrong solutions: name plausible mistakes the checks must catch",
    ], key);
  }
});

test("the solution must change the starter", () => {
  const { revision, private: secret } = of("PY-002");
  assert.deepEqual(publishProblems(revision, { ...secret, solution: revision.starter }), [
    "the solution is the starter unchanged",
  ]);
});
