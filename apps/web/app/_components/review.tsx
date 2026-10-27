"use client";
import {
  failureText,
  type CheckRow,
  type Diagnosis,
  type FailureCategory,
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

function FailedRow({ row }: { row: CheckRow }) {
  return (
    <li>
      <span className="mark" aria-hidden>
        ✘
      </span>
      <div>
        <b>{row.name}</b>
        {!row.visible && <HiddenCase />}
        <CaseDiff row={row} />
      </div>
    </li>
  );
}

/** Public failures stay explicit; repeated hidden failures share safe category summaries. */
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
  const publicRows = diagnosis.failed.filter((row) => row.visible);
  const hiddenRows = diagnosis.failed.filter((row) => !row.visible);
  const categories = new Map<FailureCategory, number>();
  for (const row of hiddenRows) {
    const category = row.failure?.category ?? "no-result";
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  return (
    <>
      {publicRows.length > 0 && (
        <ul className="ci-failing">
          {publicRows.map((row, i) => (
            <FailedRow key={i} row={row} />
          ))}
        </ul>
      )}
      {hiddenRows.length > 0 && (
        <div className="hidden-checks">
          <p>
            {hiddenRows.length} hidden{" "}
            {hiddenRows.length === 1 ? "check failed" : "checks failed"}.
          </p>
          <ul className="ci-hidden-summary">
            {[...categories].map(([category, count]) => (
              <li key={category}>
                {count} {count === 1 ? "case" : "cases"}:{" "}
                {failureText({ category })}
              </li>
            ))}
          </ul>
          <details>
            <summary>
              Details for {hiddenRows.length} hidden{" "}
              {hiddenRows.length === 1 ? "check" : "checks"}
            </summary>
            <ul className="ci-failing">
              {hiddenRows.map((row, i) => (
                <FailedRow key={i} row={row} />
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
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
