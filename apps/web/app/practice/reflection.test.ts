import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgress, withReflection, attemptFor } from "../../lib/progress";
import { parseReflection, reflectionFor } from "../../lib/solve-reflection";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Reflection } from "./reflection";
test("solves rotate through existing questions without rerender selecting another", () => {
  const questions = [5, 10, 15, 20].map(
    (completions) =>
      reflectionFor({
        "JS-900": {
          attempt: "a",
          completions,
          completedAt: "now",
          startedAt: "now",
        },
      } as any).question,
  );
  assert.deepEqual(questions, [
    "difficulty",
    "confidence",
    "would-use-ai",
    "difficulty",
  ]);
  const chosen = reflectionFor({});
  const progress = {
    "JS-900": {
      attempt: "synthetic-solve",
      startedAt: "now",
      completedAt: "now",
      completions: 1,
    },
  };
  const saved = withReflection(progress, "JS-900", "synthetic-solve", {
    ...chosen,
    dismissed: true,
  });
  const restored = parseProgress(JSON.stringify(saved));
  assert.deepEqual(
    parseProgress(JSON.stringify(progress))["JS-900"],
    progress["JS-900"],
  );
  assert.equal(
    "reflection" in
      parseProgress(
        JSON.stringify({
          "JS-900": {
            ...progress["JS-900"],
            reflection: { question: "invalid", dismissed: false },
          },
        }),
      )["JS-900"],
    false,
  );
  assert.deepEqual(restored["JS-900"].reflection, {
    ...chosen,
    dismissed: true,
  });
  // View-cache eviction cannot affect progress; a new attempt starts without the choice.
  const fresh = attemptFor(restored, "JS-900", true, "later", () => "fresh");
  assert.equal(fresh.progress["JS-900"].reflection, undefined);
  assert.deepEqual(
    withReflection(restored, "JS-900", "obsolete-attempt", chosen),
    restored,
  );
  assert.equal(
    parseReflection({ question: "invented", dismissed: false }),
    undefined,
  );
});
test("one question with easy skip; answered or skipped never mounts a second question", () => {
  const state = { ...reflectionFor({}), dismissed: false };
  const html = renderToStaticMarkup(
    createElement(Reflection, { state, onDismiss() {} }),
  );
  assert.match(html, /How hard was it/);
  assert.match(html, /Skip/);
  assert.doesNotMatch(html, /how sure|At work/);
  assert.equal(
    renderToStaticMarkup(
      createElement(Reflection, {
        state: { ...state, dismissed: true },
        onDismiss() {},
      }),
    ),
    "",
  );
});

test("cooldown offers nothing on the first four solves or between fifth-solve milestones", () => {
  for (let solves = 0; solves <= 15; solves++) {
    const state = reflectionFor({
      "JS-900": {
        attempt: "a",
        startedAt: "now",
        completedAt: "now",
        completions: solves,
      },
    });
    assert.equal(state.dismissed, solves === 0 || solves % 5 !== 0);
  }
});
