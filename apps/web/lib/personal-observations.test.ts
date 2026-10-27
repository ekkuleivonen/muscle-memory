import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAttempts } from "../../../packages/developer-profile/derive";
import { trace } from "../../../packages/developer-profile/fixtures";
import { personalObservations, evidenceActions } from "./personal-observations";
import type { ChallengeSummary } from "./challenges";
const catalog = [
  { key: "JS-001", language: "javascript", tags: ["strings"], runnable: true },
  { key: "JS-002", language: "javascript", tags: ["arrays"], runnable: true },
  { key: "PY-001", language: "python", tags: ["strings"], runnable: true },
].map((c) => ({
  ...c,
  language: c.language as ChallengeSummary["language"],
  revision: `sha256:${"a".repeat(64)}`,
  title: c.key,
  summary: "Synthetic catalog",
  difficulty: "easy" as const,
}));
test("overview describes actual solving/editing/recovery with evidence rather than invented traits", () => {
  const a = deriveAttempts(trace(), "synthetic-participant");
  const observations = personalObservations(a);
  assert.equal(observations.length, 4);
  assert.ok(observations.every((o) => o.evidence.length === 1));
  assert.match(observations[1].text, /1.0 edits/);
  assert.match(observations[3].text, /1 observed user-check improvements/);
  assert.doesNotMatch(
    observations.map((o) => o.text).join(" "),
    /percentile|intelligence|AI dependence/,
  );
});
test("capture gaps produce availability, not invented personal zeroes", () => {
  const a = deriveAttempts(trace().slice(1), "synthetic-participant");
  assert.ok(
    personalObservations(a).every(
      (o) =>
        !["first-submit", "checkpoints", "editing", "recovery"].includes(o.id),
    ),
  );
});
test("next action targets an untouched topic in the practiced language and explains why", () => {
  const p = {
    "JS-001": {
      attempt: "a",
      startedAt: "2026-10-27",
      completedAt: null,
      completions: 0,
    },
  };
  const actions = evidenceActions(catalog, p, []);
  assert.equal(actions[0].label, "Return to JS-001");
  assert.equal(actions[1].label, "Explore JS-002");
  assert.match(actions[1].why, /none tagged arrays/);
});
