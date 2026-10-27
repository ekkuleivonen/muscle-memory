import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgress, withReflection, attemptFor } from "../../lib/progress";
import { parseReflection, reflectionFor } from "../../lib/solve-reflection";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Reflection } from "./reflection";
test("solves rotate through existing questions without rerender selecting another", () => {
  const questions = [1, 2, 3, 4].map(
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
  const state = reflectionFor({});
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
