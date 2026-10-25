/**
 * Hidden cases are no oracle, on every feedback surface ENG-329 owns: Findings, the Checks tab,
 * the practice area's check feedback and the completion outcome. Each renders a check whose hidden
 * case carries sentinel values in its name, input, expected value, returned value and error
 * message; none may appear in the HTML, while the public case's input, expected value and
 * returned value do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Case } from "../../../packages/content/model";
import { checkFeedbackOf } from "./check-feedback";
import { diagnose } from "./diagnosis";
import type { PullSummary } from "./pulls";

// The root test runner compiles JSX the classic way (React.createElement), so the components
// need React in scope before they load.
(globalThis as { React?: unknown }).React = React;
const { CheckFeedbackView, Checks, Findings } = await import(
  "../app/(browse)/_components/review"
);
const { createElement } = React;

const SECRET = [
  "SECRET_TYPE",
  "SECRET_NAME",
  "SECRET_INPUT",
  "SECRET_EXPECTED",
  "SECRET_GOT",
  "SECRET_MESSAGE",
];

const cases: Case[] = [
  {
    id: "p",
    name: "public case",
    input: ["PUBLIC_INPUT"],
    expected: "PUBLIC_EXPECTED",
    visible: true,
  },
  {
    id: "h",
    name: "SECRET_NAME",
    input: ["SECRET_INPUT"],
    expected: "SECRET_EXPECTED",
    visible: false,
  },
  {
    id: "e",
    name: "SECRET_NAME",
    input: ["SECRET_INPUT"],
    expected: "SECRET_EXPECTED",
    visible: false,
  },
];

const out = (text: string) => ({
  output: { text: JSON.stringify(text), truncated: false },
});
const outcome = {
  status: "completed",
  phase: "tests",
  cases: [
    out("PUBLIC_GOT"),
    out("SECRET_GOT"),
    // JavaScript code can set an error's name from its input: the type is no safe category.
    { error: { type: "SECRET_TYPE", message: "SECRET_MESSAGE" } },
  ],
  // Printing an argument during the full check would reveal a hidden input.
  stdout: { text: "SECRET_INPUT" },
  durationMs: 4,
};

const pull: PullSummary = {
  issue: "x",
  issueRevision: "r",
  number: 1,
  runId: "run",
  codeRevision: 1,
  codeArtifactId: "a",
  result: "checks-failed",
  passed: 0,
  total: 3,
  at: "2026-10-25T10:00:00.000Z",
  openedAt: "2026-10-25T10:00:00.000Z",
  pushes: 1,
  state: "open",
};

function assertNoSecrets(html: string, surface: string) {
  for (const secret of SECRET)
    assert.ok(!html.includes(secret), `${surface} leaks ${secret}`);
}

test("Findings: hidden cases by position and failure category; the public case in full", () => {
  const html = renderToStaticMarkup(
    createElement(Findings, {
      pull,
      outcome,
      cases,
      threads: [],
      revisions: {},
    }),
  );
  assertNoSecrets(html, "Findings");
  for (const shown of [
    "PUBLIC_INPUT",
    "PUBLIC_EXPECTED",
    "PUBLIC_GOT",
    "hidden case 2",
    "hidden case 3",
  ])
    assert.ok(html.includes(shown), `Findings should show ${shown}`);
  assert.ok(html.includes("Raised an error."));
  assert.ok(html.includes("Returned a different value from the one expected."));
});

test("the Checks tab: no hidden values, and no printed output from a full check", () => {
  const html = renderToStaticMarkup(createElement(Checks, { outcome, cases }));
  assertNoSecrets(html, "Checks");
  assert.ok(html.includes("PUBLIC_EXPECTED"));
  assert.ok(html.includes("Printed output isn&#x27;t shown"));
});

test("the practice area's check feedback carries no hidden values", () => {
  const feedback = checkFeedbackOf({
    blocker: "checks",
    running: false,
    latest: { passed: 0, total: 3 },
    diagnosis: diagnose(outcome, cases),
    required: [],
  });
  const html = renderToStaticMarkup(
    createElement(CheckFeedbackView, { feedback }),
  );
  assertNoSecrets(html, "CheckFeedbackView");
  assert.ok(html.includes("3 of 3 cases failed."));
  // The model itself, which the practice area may read directly, is as clean as its rendering.
  assertNoSecrets(JSON.stringify(feedback), "checkFeedbackOf");
});

test("a passing check shows a hidden case's position only", () => {
  const passing = {
    ...outcome,
    cases: [
      out("PUBLIC_EXPECTED"),
      out("SECRET_EXPECTED"),
      out("SECRET_EXPECTED"),
    ],
  };
  const html = renderToStaticMarkup(
    createElement(Checks, { outcome: passing, cases }),
  );
  assertNoSecrets(html, "Checks (passing)");
  assertNoSecrets(
    JSON.stringify(diagnose(passing, cases)),
    "diagnose (passing)",
  );
});
