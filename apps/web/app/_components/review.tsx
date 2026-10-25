"use client";
import {
  failureText,
  type CheckRow,
  type Diagnosis,
} from "../../lib/diagnosis";
import type { CheckFeedback } from "../../lib/check-feedback";
import { Markdown } from "./markdown";

/**
 * Check feedback in practice: a failing public case reads as its input, the expected value and
 * what the code gave; a hidden case gives its position and how it failed, never its values
 * (lib/diagnosis.ts). Nothing suggests code.
 */

const show = (value: unknown) => JSON.stringify(value);

/** Marks a hidden case: only Submit runs it, and its values stay hidden. */
const HiddenCase = () => (
  <span
    className="ci-only"
    title="Not one of the examples. Its input and expected value stay hidden."
  >
    hidden case
  </span>
);

/**
 * A public case's input, the value it should give and, when it failed, what the code gave
 * instead. A hidden case shows only how it failed.
 */
export function CaseDiff({ row }: { row: CheckRow }) {
  const { detail } = row;
  if (!detail)
    return row.failure ? (
      <p className="case-failure">{failureText(row.failure)}</p>
    ) : null;
  return (
    <dl className="case-diff">
      <dt>Input</dt>
      <dd>
        <code>{show(detail.input)}</code>
      </dd>
      <dt>Expected</dt>
      <dd>
        <code>{show(detail.expected)}</code>
      </dd>
      {detail.got && (
        <>
          <dt>{detail.got.label}</dt>
          <dd className="case-got">
            <code>{detail.got.text}</code>
          </dd>
        </>
      )}
    </dl>
  );
}

/**
 * A check that stopped before the cases' results, when the run includes hidden cases: only the
 * stage the runner recorded. The error is the code's own text and can carry a hidden input.
 */
function stageText(stage: "compile" | "runtime"): string {
  return stage === "compile"
    ? "The code didn't compile. Run examples to see the error."
    : "The code raised an error before the checks finished. Run examples to see it.";
}

/** The failing cases: the public ones in full, the hidden ones by name and how they failed. */
export function FailedChecks({ diagnosis }: { diagnosis: Diagnosis | null }) {
  if (diagnosis?.kind === "error")
    return (
      <p className="ci-error">
        {diagnosis.error ? (
          <code>
            {diagnosis.error.type}: {diagnosis.error.message}
          </code>
        ) : (
          stageText(diagnosis.stage)
        )}
      </p>
    );
  if (diagnosis?.kind !== "tests" || !diagnosis.failed.length) return null;
  return (
    <ul className="ci-failing">
      {diagnosis.failed.map((row, i) => (
        <li key={i}>
          <span className="mark" aria-hidden>
            ✘
          </span>
          <div>
            <b>{row.name}</b>
            {!row.visible && <HiddenCase />}
            <CaseDiff row={row} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The latest submission, in practice (lib/check-feedback.ts): one headline, what to do
 * next, failing cases (hidden ones by name and how they failed) and any required rule the code
 * still triggers. It holds no state and records nothing; the parent re-reads it after a check.
 */
export function CheckFeedbackView({ feedback }: { feedback: CheckFeedback }) {
  return (
    <section
      className={`check-feedback ${feedback.tone}`}
      aria-live="polite"
      aria-label="Check result"
    >
      <p className="check-headline">{feedback.headline}</p>
      {feedback.diagnosis && <FailedChecks diagnosis={feedback.diagnosis} />}
      {feedback.required.length > 0 && (
        <ul className="check-required">
          {feedback.required.map((rule) => (
            <li key={rule.id}>
              <Markdown source={rule.text} />
            </li>
          ))}
        </ul>
      )}
      {feedback.next && <p className="check-next dim">{feedback.next}</p>}
    </section>
  );
}
