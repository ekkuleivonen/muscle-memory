"use client";
import { useState } from "react";
import type { Case, Revision } from "../../../../../packages/content/model";
import type { BoardMoveVia } from "../../../../../packages/domain/board";
import type { Json } from "../../../../../packages/domain/json";
import {
  diagnose,
  failureText,
  type CheckRow,
  type Diagnosis,
} from "../../../lib/diagnosis";
import type { CheckFeedback } from "../../../lib/check-feedback";
import { isCiFinding, type Thread } from "../../../lib/feedback";
import type { PullSummary } from "../../../lib/pulls";
import { Markdown } from "./markdown";

/**
 * A pull request's review, as its page shows it: Findings (what is left to fix, and what was
 * fixed before, folded away) and the Checks tab (every case as CI ran it). A failing public case
 * reads as its input, the expected value and what the code gave; a hidden case gives its name and
 * how it failed, never its values (lib/diagnosis.ts). Nothing suggests code. Whether it can merge is said once, by the merge box.
 */

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

const show = (value: unknown) => JSON.stringify(value);

type Resolve = (thread: Thread, via: BoardMoveVia) => Promise<void>;
type Reply = (thread: Thread, text: string) => Promise<void>;

/** A click from the keyboard (Enter or Space) has no pointer position. */
const via = (event: React.MouseEvent): BoardMoveVia =>
  event.detail === 0 ? "keyboard" : "pointer";

/**
 * What stands between this pull request and merging, and only that: the latest push's failing
 * checks, which only a push that passes can clear, and review findings (the latest thread of each
 * blocking comment or nit), each resolvable by a push that fixes it, a reply or Resolve. Resolving
 * never touches CI, and a finding the code still triggers opens again on the next push. Resolved
 * findings are history: folded under the open ones.
 */
export function Findings({
  pull,
  outcome,
  cases,
  threads,
  revisions,
  onResolve,
  onReply,
}: {
  pull: PullSummary;
  /** The latest push's CI outcome (PullDetail.outcome). */
  outcome: Json | null;
  /** The cases CI ran: the pull request revision's checks. */
  cases?: readonly Case[];
  /** This pull request's review threads (lib/feedback). */
  threads: Thread[];
  revisions: Record<string, Revision>;
  /** Absent once the pull request is merged or closed. */
  onResolve?: Resolve;
  onReply?: Reply;
}) {
  const failing =
    pull.result !== "checks-passed" &&
    pull.result !== "merged" &&
    pull.result !== "running";
  const diagnosis = failing ? diagnose(outcome, cases) : null;
  // The latest thread of each actionable comment, and every CI finding (with
  // Revision.ciFindings, a failing push's own resolvable thread).
  const latest = new Map<string, Thread>();
  for (const t of threads) if (t.severity !== "info") latest.set(t.comment, t);
  const review = [...latest.values()];
  const ciThreads = review.some((t) => isCiFinding(t.comment));
  // Without CI findings, failing checks are listed as they stand, cleared only by passing.
  const ci = failing && !ciThreads;
  const open = review.filter((t) => !t.resolved);
  const resolved = review.filter((t) => t.resolved);
  if (!ci && !review.length) return null;
  const count = (ci ? 1 : 0) + open.length;
  const item = (thread: Thread) =>
    isCiFinding(thread.comment) ? (
      <CiFinding
        key={`${thread.comment}@${thread.at}`}
        thread={thread}
        pull={pull}
        diagnosis={failing ? diagnosis : null}
        onResolve={onResolve}
      />
    ) : (
      <ReviewThread
        key={`${thread.comment}@${thread.at}`}
        thread={thread}
        revision={revisions[thread.issueRevision]}
        onResolve={onResolve}
        onReply={onReply}
      />
    );
  return (
    <section className="pull-findings" aria-labelledby="pull-findings-title">
      {/* Focusable, so a link to #pull-findings-title lands on it and Tab goes on to Resolve. */}
      <h2 id="pull-findings-title" tabIndex={-1}>
        Findings{" "}
        <span className={count ? "count open" : "count"}>
          {count ? `${count} unresolved` : "all resolved"}
        </span>
      </h2>
      {ci && (
        <div className="finding ci">
          <p>
            <b>CI</b> <span className="review-badge blocking">Failing</span>{" "}
            {failingSummary(pull, diagnosis)}
          </p>
          <FailedChecks diagnosis={diagnosis} />
        </div>
      )}
      {open.length > 0 && <ol className="pull-review">{open.map(item)}</ol>}
      {resolved.length > 0 && (
        <details className="pull-resolved">
          <summary>
            {resolved.length} resolved{" "}
            {resolved.length === 1 ? "finding" : "findings"}
          </summary>
          <ol className="pull-review">{resolved.map(item)}</ol>
        </details>
      )}
    </section>
  );
}

/** "2 of 5 checks fail on push 3.", or how CI stopped. */
function failingSummary(
  pull: PullSummary,
  diagnosis: Diagnosis | null,
): string {
  if (diagnosis?.kind === "tests")
    return `${diagnosis.failed.length} of ${diagnosis.rows.length} checks ${
      diagnosis.failed.length === 1 ? "fails" : "fail"
    } on push ${pull.pushes}.`;
  if (diagnosis?.kind === "error")
    return `CI didn't reach the tests on push ${pull.pushes}.`;
  if (diagnosis?.kind === "stopped")
    return diagnosis.reason === "timeout"
      ? `CI timed out on push ${pull.pushes}.`
      : diagnosis.reason === "runner-error"
        ? `CI crashed on push ${pull.pushes}; this wasn't your code. Push again to rerun it.`
        : `CI was cancelled on push ${pull.pushes}.`;
  return `${pull.passed} of ${pull.total} checks passed on push ${pull.pushes}.`;
}

/** Marks a hidden case: only the full check runs it, and its values stay hidden. */
const HiddenCase = () => (
  <span
    className="ci-only"
    title="Not in the repo's test file. Its input and expected value stay hidden."
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

/** The failing cases: the public ones in full, the hidden ones by name and how they failed. */
export function FailedChecks({ diagnosis }: { diagnosis: Diagnosis | null }) {
  if (diagnosis?.kind === "error")
    return (
      <p className="ci-error">
        <code>
          {diagnosis.error.type}: {diagnosis.error.message}
        </code>
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
 * A CI finding: the failing push that opened it, what fails now, and Resolve. Resolving it is
 * the person's acknowledgement only; merging still needs the latest push's checks to pass.
 */
function CiFinding({
  thread,
  pull,
  diagnosis,
  onResolve,
}: {
  thread: Thread;
  pull: PullSummary;
  /** The latest push's failure; null when it passed. */
  diagnosis: Diagnosis | null;
  onResolve?: Resolve;
}) {
  return (
    <li className={`review-thread ${thread.resolved ? "" : "open"}`}>
      <span className="dot" aria-hidden />
      <div className="review-card">
        <header>
          <b>CI</b>{" "}
          {thread.resolved ? (
            <span className="review-badge resolved">Resolved by you</span>
          ) : (
            <span className="review-badge blocking">
              Unresolved · blocks merging
            </span>
          )}
          <span className="faint">push {thread.push}</span>
          <time dateTime={thread.at}>{clock(thread.at)}</time>
        </header>
        {!thread.resolved && (
          <p>
            {diagnosis
              ? `Still failing: ${failingSummary(pull, diagnosis)}`
              : `Push ${pull.pushes} passes. Resolve this once you've checked the failure is dealt with.`}
          </p>
        )}
        {!thread.resolved && <FailedChecks diagnosis={diagnosis} />}
        {!thread.resolved && onResolve && (
          <button
            type="button"
            className="review-resolve"
            onClick={(event) => void onResolve(thread, via(event))}
          >
            Resolve
          </button>
        )}
      </div>
    </li>
  );
}

/** A teammate's review finding, its replies and whether it is resolved. */
function ReviewThread({
  thread,
  revision,
  onResolve,
  onReply,
}: {
  thread: Thread;
  revision: Revision | undefined;
  onResolve?: Resolve;
  onReply?: Reply;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const comment = revision?.team.find((c) => c.id === thread.comment);
  if (!comment) return null;
  const blocking = thread.severity === "blocking";
  const send = async () => {
    if (!text.trim() || !onReply) return;
    setSending(true);
    try {
      await onReply(thread, text);
      setText("");
    } finally {
      setSending(false);
    }
  };
  return (
    <li
      className={`review-thread ${blocking && !thread.resolved ? "open" : ""}`}
    >
      <span className="dot" aria-hidden />
      <div className="review-card">
        <header>
          <b>{comment.author.name}</b>{" "}
          <span className="faint">· {comment.author.role}</span>{" "}
          {thread.resolved ? (
            <span className="review-badge resolved">
              {thread.resolved.by === "code"
                ? `Resolved by push ${thread.resolved.push}`
                : thread.resolved.by === "resolve"
                  ? "Resolved by you"
                  : "Resolved by your reply"}
            </span>
          ) : blocking || comment.resolve === "explicit" ? (
            <span className="review-badge blocking">
              Unresolved · blocks merging
            </span>
          ) : (
            <span className="review-badge">Unresolved · nit</span>
          )}
          <span className="faint">push {thread.push}</span>
          <time dateTime={thread.at}>{clock(thread.at)}</time>
        </header>
        <Markdown source={comment.text[thread.wording] ?? comment.text[0]} />
        {thread.replies.map((r, i) => (
          <div className="review-reply" key={i}>
            <b>You</b> <time dateTime={r.at}>{clock(r.at)}</time>
            <p>{r.text}</p>
          </div>
        ))}
        {onResolve && !thread.resolved && (
          <button
            type="button"
            className="review-resolve"
            title="If the next push still does this, it opens again."
            onClick={(event) => void onResolve(thread, via(event))}
          >
            Resolve
          </button>
        )}
        {onReply && comment.resolve !== "explicit" && (
          <form
            className="review-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              value={text}
              rows={2}
              placeholder={
                blocking && !thread.resolved
                  ? "Reply, if the code should stay as it is…"
                  : "Reply…"
              }
              aria-label={`Reply to ${comment.author.name}`}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" disabled={!text.trim() || sending}>
              Reply
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * Every case as CI ran it on the latest push, passing ones included: the detail behind Findings.
 * Passing cases are one line; failing ones show what the code gave next to the expected value.
 */
export function Checks({
  outcome: raw,
  cases,
}: {
  outcome: Json | null;
  cases?: readonly Case[];
}) {
  const diagnosis = diagnose(raw, cases);
  const outcome = raw as {
    stdout?: { text: string };
    durationMs?: number;
  } | null;
  if (!diagnosis)
    return <p className="dim">No CI results for this pull request.</p>;
  if (diagnosis.kind === "stopped")
    return diagnosis.reason === "timeout" ? (
      <p className="pull-error">
        The checks timed out after{" "}
        {Math.round((diagnosis.timeoutMs ?? 0) / 1000)} s, before every case
        finished.
      </p>
    ) : diagnosis.reason === "runner-error" ? (
      <p className="pull-error">
        CI crashed before the checks finished; this wasn&apos;t your code. Push
        again to rerun them.
      </p>
    ) : (
      <p className="dim">The checks were cancelled.</p>
    );
  return (
    <div className="pull-checks">
      {diagnosis.kind === "error" && (
        <div className="pull-error">
          <b>
            {diagnosis.error.type}: {diagnosis.error.message}
          </b>
          {diagnosis.traceback && <pre>{diagnosis.traceback}</pre>}
        </div>
      )}
      {diagnosis.kind === "tests" && (
        <ol>
          {diagnosis.rows.map((row, i) => (
            <li key={i} className={row.passed ? "pass" : "fail"}>
              <span
                className="mark"
                aria-label={row.passed ? "Passed" : "Failed"}
              >
                {row.passed ? "✔" : "✘"}
              </span>
              <div>
                <b>{row.name}</b>
                {!row.visible && <HiddenCase />}{" "}
                {row.passed ? (
                  row.detail && (
                    <>
                      <code>{show(row.detail.input)}</code>{" "}
                      <span className="dim">→</span>{" "}
                      <code>{show(row.detail.expected)}</code>
                    </>
                  )
                ) : (
                  <CaseDiff row={row} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {outcome?.stdout?.text &&
        (diagnosis.kind === "tests" &&
        diagnosis.rows.some((r) => !r.visible) ? (
          // Printing an argument would reveal a hidden case's input.
          <p className="dim pull-output">
            Printed output isn&apos;t shown for the full check, which includes
            hidden cases. Run the tests to see what your code prints.
          </p>
        ) : (
          <details className="pull-output">
            <summary>Printed output</summary>
            <pre>{outcome.stdout.text}</pre>
          </details>
        ))}
      {typeof outcome?.durationMs === "number" && (
        <p className="dim pull-duration">
          Ran in {Math.round(outcome.durationMs)} ms.
        </p>
      )}
    </div>
  );
}

/**
 * The latest full check, in the practice area (lib/check-feedback.ts): one headline, what to do
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
