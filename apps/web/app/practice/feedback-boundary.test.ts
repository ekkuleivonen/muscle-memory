/** Shell contract: use the real read-only components, never a second diagnosis/writer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Case } from "../../../../packages/content/model";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { transcript } from "./transcript";
import type { RunView } from "../workspace/session";

(globalThis as { React?: unknown }).React = React;
const { CheckFeedbackView } = await import(
  "../(browse)/_components/review"
);
const { ChallengeExamples } = await import(
  "../(browse)/_components/challenge-examples"
);
const bounded = (text: string) => ({
  text,
  bytes: text.length,
  truncated: false,
});
const cases: Case[] = [
  {
    id: "public",
    input: "PUBLIC_INPUT",
    expected: { answer: "PUBLIC_EXPECTED" },
    hidden: false,
  },
  {
    id: "hidden",
    name: "HIDDEN_NAME_TOKEN",
    input: "HIDDEN_INPUT_TOKEN",
    expected: {
      answer: "HIDDEN_EXPECTED_TOKEN",
      solution: "HIDDEN_SOLUTION_TOKEN",
    },
    hidden: true,
  },
];
const hidden = [
  "HIDDEN_NAME_TOKEN",
  "HIDDEN_INPUT_TOKEN",
  "HIDDEN_EXPECTED_TOKEN",
  "HIDDEN_SOLUTION_TOKEN",
];
test("public expected/actual stay visible while nested hidden expected outputs and solutions stay private across shell feedback", () => {
  for (const hiddenPasses of [false, true]) {
    const outcome: NonNullable<RunView["outcome"]> = {
      status: "completed",
      phase: "tests",
      durationMs: 1,
      cases: [
        {
          index: 0,
          output: bounded(JSON.stringify({ answer: "PUBLIC_ACTUAL" })),
        },
        {
          index: 1,
          output: bounded(
            JSON.stringify(
              hiddenPasses
                ? cases[1].expected
                : { solution: "HIDDEN_SOLUTION_TOKEN" },
            ),
          ),
        },
      ],
      stdout: bounded(hidden.join(" ")),
      stderr: bounded(hidden.join(" ")),
    };
    // The public case fails either way, so the submission failed.
    const feedback = checkFeedbackOf({
      running: false,
      completed: false,
      edited: false,
      verdict: {
        result: "failed",
        passed: hiddenPasses ? 1 : 0,
        total: 2,
        rules: [],
        complete: false,
      },
      diagnosis: diagnose(outcome, cases),
    });
    const render = (component: React.ElementType, props: object) =>
      renderToStaticMarkup(React.createElement(component, props));
    const full = {
      Practice: render(CheckFeedbackView, { feedback }),
      Output: transcript(
        {
          runId: "boundary-run",
          revision: 1,
          status: "result",
          purpose: "submit",
          outcome,
        },
        {
          challenge: "JS-001",
          task: "Solve it.",
          language: "javascript",
          file: "solution.js",
          starter: "",
          entrypoint: "solve",
          cases,
          rules: [],
        },
        "JavaScript",
      )
        .map((l) => l.text)
        .join("\n"),
    };
    for (const [surface, text] of Object.entries(full)) {
      for (const token of hidden)
        assert.ok(!text.includes(token), `${surface} leaked ${token}`);
      for (const token of ["PUBLIC_EXPECTED", "PUBLIC_ACTUAL"])
        assert.ok(text.includes(token), `${surface} lost ${token}`);
    }
    for (const compact of [false, true]) {
      const examples = render(ChallengeExamples, { examples: cases, compact });
      for (const token of hidden)
        assert.ok(!examples.includes(token), `Examples leaked ${token}`);
      assert.ok(examples.includes("PUBLIC_EXPECTED"));
    }
  }
});
