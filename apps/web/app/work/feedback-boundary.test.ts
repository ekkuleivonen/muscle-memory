/** Shell contract: use the real read-only components, never a second diagnosis/writer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Case } from "../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../packages/domain/workspace";
import type { PullSummary } from "../../lib/pulls";
import { checkFeedbackOf } from "../../lib/check-feedback";
import { diagnose } from "../../lib/diagnosis";
import { evidenceOf } from "../../lib/evidence";
import { live } from "../../lib/test-fixtures";
import { transcript } from "./transcript";
import type { RunView } from "../workspace/session";

(globalThis as { React?: unknown }).React = React;
const { CheckFeedbackView, Checks, Findings } = await import(
  "../(browse)/_components/review"
);
const { ChallengeExamples } = await import(
  "../(browse)/_components/challenge-examples"
);
const { OutcomeView } = await import("../(browse)/_components/pull-outcome");
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
    visible: true,
  },
  {
    id: "hidden",
    name: "HIDDEN_NAME_TOKEN",
    input: "HIDDEN_INPUT_TOKEN",
    expected: {
      answer: "HIDDEN_EXPECTED_TOKEN",
      solution: "HIDDEN_SOLUTION_TOKEN",
    },
    visible: false,
  },
];
const hidden = [
  "HIDDEN_NAME_TOKEN",
  "HIDDEN_INPUT_TOKEN",
  "HIDDEN_EXPECTED_TOKEN",
  "HIDDEN_SOLUTION_TOKEN",
];
const pull: PullSummary = {
  issue: "boundary-test",
  issueRevision: "fixture",
  number: 1,
  runId: "boundary-run",
  codeRevision: 1,
  codeArtifactId: "fixture-code",
  result: "checks-failed",
  passed: 0,
  total: 2,
  at: "2026-10-25T10:00:00.000Z",
  openedAt: "2026-10-25T10:00:00.000Z",
  pushes: 1,
  state: "open",
};

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
    const feedback = checkFeedbackOf({
      blocker: "checks",
      running: false,
      completed: false,
      latest: { passed: hiddenPasses ? 1 : 0, total: 2 },
      diagnosis: diagnose(outcome, cases),
      required: [],
    });
    const render = (component: React.ElementType, props: object) =>
      renderToStaticMarkup(React.createElement(component, props));
    const full = {
      Findings: render(Findings, {
        pull,
        outcome,
        cases,
        threads: [],
        revisions: {},
      }),
      Checks: render(Checks, { outcome, cases }),
      Practice: render(CheckFeedbackView, { feedback }),
      Output: transcript(
        {
          runId: pull.runId,
          revision: 1,
          status: "result",
          purpose: "pull-request",
          outcome,
        },
        {
          language: "javascript",
          entry: "solution.js",
          entrypoint: "solve",
          cases,
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

    // The historical outcome uses the real evidence reader: raw cases are not a rendering input.
    const fixture = live("frequency-map");
    const revision = {
      ...fixture.revision,
      checks: { ...fixture.revision.checks, cases },
    };
    const observe = (
      type: string,
      data: object,
      sequence: number,
    ): WorkspaceRecord => ({
      kind: "observation",
      recordId: `boundary.${sequence}`,
      participantId: "synthetic-boundary",
      payload: JSON.stringify({
        type,
        data,
        source: { id: "boundary", sequence },
        issue: pull.issue,
        issueRevision: fixture.id,
        occurredAt: new Date(1792922400000 + sequence).toISOString(),
      }),
    });
    const completedOutcome = {
      ...outcome,
      cases: cases.map((c, index) => ({
        index,
        output: bounded(JSON.stringify(c.expected)),
      })),
    };
    const records = [
      observe(
        "observation.workspace.pull-request",
        {
          number: 1,
          push: 1,
          runId: pull.runId,
          codeArtifactId: pull.codeArtifactId,
          revision: 1,
          result: "checks-passed",
          passed: 2,
          total: 2,
        },
        1,
      ),
      observe(
        "observation.workspace.run",
        {
          runId: pull.runId,
          purpose: "pull-request",
          status: "result",
          outcome: completedOutcome,
        },
        2,
      ),
      observe(
        "observation.board.moved",
        {
          trigger: "pull-request-merged",
          to: "done",
          pullRequest: 1,
          runId: pull.runId,
        },
        3,
      ),
    ];
    const evidence = evidenceOf({
      records,
      issue: pull.issue,
      number: 1,
      revisionFor: () => revision,
      until: "2026-10-25T11:00:00.000Z",
    });
    assert.ok(
      evidence,
      "the real historical reader should produce the fixture's evidence",
    );
    const completed = render(OutcomeView, { evidence });
    assert.ok(completed.includes("Outcome"));
    for (const token of hidden)
      assert.ok(!completed.includes(token), `Outcome leaked ${token}`);
  }
});
