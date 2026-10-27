import { test } from "node:test";
import assert from "node:assert/strict";
import { currentCohort, cohortMemberQuery } from "./current-cohort";
import { syntheticRevision } from "../developer-profile/fixtures";
const revision = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const rows = Array.from({ length: 20 }, (_, i) => ({
  participant_id: `synthetic-${i}`,
  runtime: '{"engine":"synthetic"}',
  diagnostics: 0,
  practice: "first",
  completed: 1,
  first_pass: 1,
  submissions: 2,
}));
const eligible = () => rows.map(() => revision);
test("20 to 19 current members suppresses, no member IDs survive aggregation", async () => {
  const yes = await currentCohort(async () => rows, {
    check: async () => eligible(),
  });
  assert.equal(yes.groups.length, 1);
  assert.doesNotMatch(
    JSON.stringify(yes),
    /synthetic-\d|participant_id|aaaaaaaa/,
  );
  const no = await currentCohort(async () => rows, {
    check: async () => [null, ...eligible().slice(1)],
  });
  assert.deepEqual(no.groups, []);
});
test("privacy change during read rejects result; changes before and after a previous read are fresh", async () => {
  let calls = 0;
  await assert.rejects(() =>
    currentCohort(async () => rows, {
      check: async () =>
        ++calls === 1 ? eligible() : [null, ...eligible().slice(1)],
    }),
  );
  await currentCohort(async () => rows, { check: async () => eligible() });
  const later = await currentCohort(async () => rows, {
    check: async () => eligible().map(() => null),
  });
  assert.deepEqual(later.groups, []);
});
test("control failures, malformed control replies, duplicate browsers and budgets reject", async () => {
  for (const check of [
    async () => {
      throw new Error("private detail");
    },
    async () => [],
    async () => rows.map(() => "bad"),
  ])
    await assert.rejects(() => currentCohort(async () => rows, { check }));
  for (const input of [
    [...rows, rows[0]],
    rows.map((r) => ({ ...r, participant_id: "../proof" })),
    Array(1001).fill(rows[0]),
  ])
    await assert.rejects(() =>
      currentCohort(async () => input, { check: async () => eligible() }),
    );
});
test("only exact registered-revision-shaped query inputs, no arbitrary SQL", () => {
  assert.match(
    cohortMemberQuery("JS-001", syntheticRevision),
    /SELECT participant_id, runtime/,
  );
  assert.match(cohortMemberQuery("JS-001", syntheticRevision), /LIMIT 1001$/);
  assert.throws(() => cohortMemberQuery("' OR 1=1", syntheticRevision));
  assert.throws(() => cohortMemberQuery("JS-001", "../../control"));
});
