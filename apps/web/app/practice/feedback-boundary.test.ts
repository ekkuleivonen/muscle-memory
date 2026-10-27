/** Shell contract: use the real read-only components, never a second diagnosis/writer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import type { Case } from "../../../../packages/content/model";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { transcript } from "./transcript";
import type { RunView } from "./session";

(globalThis as { React?: unknown }).React = React;
const { CheckFeedbackView } = await import("../_components/review");
const { ChallengeExamples } = await import("../_components/challenge-examples");
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
test("repetitive hidden failures are summarized while every safe diagnostic remains available on demand", () => {
  const checks: Case[] = [
    cases[0],
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `private-${i}`,
      name: `PRIVATE_NAME_${i}`,
      input: `PRIVATE_INPUT_${i}`,
      expected: `PRIVATE_EXPECTED_${i}`,
      hidden: true,
    })),
  ];
  const outcome = {
    status: "completed",
    phase: "tests",
    cases: [
      { output: bounded('"PUBLIC_ACTUAL"') },
      ...Array.from({ length: 15 }, (_, i) =>
        i === 12
          ? { error: { type: "PRIVATE_ERROR", message: "PRIVATE_MESSAGE" } }
          : i === 13
            ? { output: { ...bounded("PRIVATE_OUTPUT"), truncated: true } }
            : i === 14
              ? { unserializable: "PRIVATE_RETURN_TYPE" }
              : { output: bounded('"PRIVATE_WRONG_VALUE"') },
      ),
    ],
  };
  const diagnosis = diagnose(outcome, checks);
  const feedback = checkFeedbackOf({
    running: false,
    completed: false,
    edited: false,
    verdict: {
      result: "failed",
      passed: 0,
      total: checks.length,
      rules: [],
      complete: false,
    },
    diagnosis,
  });
  const html = renderToStaticMarkup(
    React.createElement(CheckFeedbackView, { feedback }),
  );
  const { document } = parseHTML(html);
  const details = document.querySelector(".hidden-checks details");
  assert.ok(details);
  assert.equal(
    details.hasAttribute("open"),
    false,
    "hidden details start collapsed",
  );
  assert.equal(document.querySelectorAll(".ci-hidden-summary > li").length, 5);
  assert.match(
    document.querySelector(".ci-hidden-summary")!.textContent!,
    /12 cases: Returned a different value/,
  );
  assert.equal(
    details.querySelectorAll(".ci-failing > li").length,
    16,
    "no failing case is discarded",
  );
  assert.equal(
    document.querySelectorAll(".check-feedback > .ci-failing > li").length,
    1,
    "public diagnostic stays outside collapsed detail",
  );
  assert.ok(html.includes("PUBLIC_EXPECTED"));
  assert.ok(html.includes("PUBLIC_ACTUAL"));
  assert.ok(
    !html.includes("PRIVATE_"),
    "hidden values/names/messages never become summary or detail text",
  );
});
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
