"use client";
/**
 * The full measurement inventory behind the report (ENG-340's registry), kept one disclosure
 * away: definitions, eligible samples, missing evidence and checkpoint timelines.
 */
import React, { useEffect, useState } from "react";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import {
  GATED,
  REPEAT_METRICS,
  REPEAT_MIN_ATTEMPTS,
  REPEAT_WINDOW_DAYS,
  METRICS,
  METRIC_VERSION,
  SECTIONS,
  type MetricId,
} from "../../../../packages/developer-profile/registry";
import { repeatHistory } from "../../../../packages/developer-profile/longitudinal";
import { languageLabel, type ChallengeSummary } from "../../lib/challenges";

const format = (id: MetricId, n: number) =>
  METRICS[id].unit === "ms"
    ? n < 1000
      ? `${Math.round(n)} ms`
      : `${(n / 1000).toFixed(1)} s`
    : METRICS[id].unit === "boolean"
      ? n
        ? "passed"
        : "did not pass"
      : `${Number.isInteger(n) ? n : n.toFixed(1)}`;
function attemptAnchor(a: Pick<AttemptSummary, "attempt" | "revision">) {
  return `attempt-${a.attempt}-${a.revision.slice(7)}`;
}
function revealAttempt() {
  if (!location.hash.startsWith("#attempt-")) return;
  const target = document.getElementById(
    decodeURIComponent(location.hash.slice(1)),
  );
  if (!(target instanceof HTMLDetailsElement)) return;
  target.open = true;
  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  target.scrollIntoView({ block: "start" });
  target.querySelector("summary")?.focus({ preventScroll: true });
}
export function Measurements({
  attempts,
  catalog,
  until,
}: {
  attempts: AttemptSummary[];
  catalog: readonly ChallengeSummary[];
  until: string;
}) {
  const [language, setLanguage] = useState("all");
  const [practice, setPractice] = useState("all");
  useEffect(() => {
    revealAttempt();
    window.addEventListener("hashchange", revealAttempt);
    return () => window.removeEventListener("hashchange", revealAttempt);
  }, []);
  const keys = new Set(
    catalog.filter((c) => language === "all" || c.language === language).map((c) => c.key),
  );
  const selected = attempts.filter(
    (a) =>
      (language === "all" || keys.has(a.challenge)) &&
      (practice === "all" || a.practice === practice),
  );
  return (
    <details className="report-appendix" id="measurements">
      <summary>
        All measurements <span className="t-dim">/ definitions, samples and timelines</span>
      </summary>
      <div className="stats-controls">
        <label>
          Language{" "}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="all">All languages</option>
            {[...new Set(catalog.map((c) => c.language).filter(Boolean))].map((l) => (
              <option key={l} value={l}>
                {languageLabel(l)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Attempts{" "}
          <select value={practice} onChange={(e) => setPractice(e.target.value)}>
            <option value="all">All</option>
            <option value="repeat">Observed repeats</option>
            <option value="unknown">First / repeat unknown</option>
          </select>
        </label>
      </div>
      <p className="t-dim">
        {selected.length} attempt revisions · interpretation {METRIC_VERSION}. Each
        value uses only eligible attempts; medians describe the tasks you chose,
        not growth. A missing value is never a zero.
      </p>
      {SECTIONS.map((section) => (
        <details className="stats-section" key={section}>
          <summary>{section}</summary>
          <div className="stats-metrics">
            {(Object.keys(METRICS) as MetricId[])
              .filter((id) => METRICS[id].section === section)
              .map((id) => (
                <Metric key={id} id={id} attempts={selected} />
              ))}
          </div>
          {GATED.filter((g) => g[0] === section).map((g) => (
            <details key={g[1]} className="stats-metric">
              <summary>
                {g[1]} <span className="t-dim">— unavailable</span>
              </summary>
              <p>{g[2]}</p>
            </details>
          ))}
          {section === "Reflection / growth" && (
            <RepeatHistory attempts={selected} until={until} />
          )}
        </details>
      ))}
      <details className="stats-section">
        <summary>
          Checkpoint timelines <span className="t-dim">/ {selected.length}</span>
        </summary>
        <p className="t-dim">
          Source sequence orders each page session; wall clock orders page
          resumes. The latest 200 checkpoints per attempt; no code or output.
        </p>
        {selected.map((a) => (
          <Attempt key={`${a.attempt}:${a.revision}`} attempt={a} />
        ))}
      </details>
    </details>
  );
}
function Metric({
  id,
  attempts,
}: {
  id: MetricId;
  attempts: AttemptSummary[];
}) {
  const definition = METRICS[id],
    eligible = attempts.filter((a) => a.values[id] !== null),
    values = eligible.map((a) => a.values[id]!).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2),
    median = values.length
      ? values.length % 2
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2
      : null;
  return (
    <details className="stats-metric">
      <summary>
        {definition.label}
        <strong>
          {median === null
            ? "unavailable"
            : definition.unit === "boolean"
              ? `${values.filter((v) => v === 1).length}/${values.length} passed`
              : format(id, median)}
          {median !== null && definition.unit !== "boolean" ? (
            <small> median / attempt</small>
          ) : null}
        </strong>
      </summary>
      <p>{definition.definition}</p>
      <p>
        {definition.minimum} {definition.baseline}
      </p>
      <p className="t-dim">
        {eligible.length} eligible / {attempts.length} retained attempt
        revisions. {attempts.length - eligible.length} missing or ineligible. No
        population baseline.
      </p>
      {!eligible.length && (
        <p>
          Needs a supported, contiguous trace and the relevant recorded events.
          Another challenge can add new evidence; it cannot recover lost
          history.
        </p>
      )}
      {attempts
        .filter((a) => a.values[id] === null)
        .map((a) => (
          <p className="t-dim" key={`missing:${a.attempt}:${a.revision}`}>
            <a
              className="t-cmd"
              href={`#${attemptAnchor(a)}`}
              onClick={() => queueMicrotask(revealAttempt)}
            >
              {a.challenge}
            </a>
            :{" "}
            {a.issues.length
              ? a.issues.join(" ")
              : ["inserted", "deleted", "smallEdits", "largeEdits"].includes(id)
                ? "Edit change sets are missing, truncated or invalid."
                : id === "runnerWait"
                  ? "A queued or terminal run is missing, duplicated or crosses source clocks."
                  : "The required event pair is absent, undecided or crosses a page resume; see the definition."}
          </p>
        ))}
      {eligible.map((a) => (
        <p key={`${a.attempt}:${a.revision}`}>
          <a
            className="t-cmd"
            href={`#${attemptAnchor(a)}`}
            onClick={() => queueMicrotask(revealAttempt)}
          >
            {a.challenge} ·{" "}
            {a.practice === "repeat" ? "repeat" : "first/repeat unknown"}
          </a>
          : {format(id, a.values[id]!)}
        </p>
      ))}
    </details>
  );
}
function Attempt({ attempt: a }: { attempt: AttemptSummary }) {
  return (
    <details id={attemptAnchor(a)} className="stats-attempt">
      <summary>
        {a.challenge} · {a.completed ? "completed" : "unfinished"} ·{" "}
        {a.practice === "repeat" ? "repeat" : "first/repeat unknown"} ·{" "}
        {a.started ? new Date(a.started).toLocaleDateString() : "start missing"}
      </summary>
      <p className="t-dim">Revision {a.revision}</p>
      {a.issues.map((i) => (
        <p key={i} className="stats-warning">
          {i}
        </p>
      ))}
      {a.conditions.map((c) => (
        <p key={c} className="t-dim">
          {c}
        </p>
      ))}
      <ol>
        {a.timeline.map((e, i) => (
          <li key={i}>
            <time>{e.at}</time> · {e.label}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Safe descriptive repeat history; fresh-task growth remains evidence-gated separately. */
export function RepeatHistory({
  attempts,
  until,
}: {
  attempts: AttemptSummary[];
  until: string;
}) {
  const history = repeatHistory(attempts, until);
  return (
    <section aria-label="Same-task repeat history">
      <h3>Same-task repeat history</h3>
      <p className="t-dim">
        Two adjacent {REPEAT_WINDOW_DAYS}-day windows, by attempt start (UTC):{" "}
        {history.earlierFrom.slice(0, 10)} → {history.recentFrom.slice(0, 10)} →{" "}
        {history.until.slice(0, 10)}. Completed observed repeats only, grouped
        by exact task revision and recorded runtime/editor tools. External
        assistance remains unknown.
      </p>
      <p className="t-dim">
        At least {REPEAT_MIN_ATTEMPTS} eligible attempts per window to display
        each median; this is a descriptive display rule, not statistical
        confidence. {history.excluded} retained attempts are outside these
        conditions/windows. This does not measure fresh-task skill or explain a
        change.
      </p>
      {!history.groups.length && (
        <p>
          No finished repeats of the same challenge version under the same
          conditions yet. Your report reads this device and up to the first
          page of your uploads; playing more cannot reconstruct
          already-compacted history.
        </p>
      )}
      {history.groups.slice(0, 10).map((g, index) => (
        <details
          className="stats-metric"
          key={`${g.challenge}:${g.revision}:${index}`}
        >
          <summary>
            {g.challenge} · {g.earlier} earlier / {g.recent} recent completed
            repeats
          </summary>
          <p className="t-dim">Revision {g.revision}</p>
          {g.conditions.map((c) => (
            <p className="t-dim" key={c}>
              {c}
            </p>
          ))}
          {REPEAT_METRICS.map((id) => (
            <p key={id}>
              {METRICS[id].label}:{" "}
              {g.metrics[id].earlier.median === null
                ? "unavailable"
                : format(id, g.metrics[id].earlier.median!)}{" "}
              →{" "}
              {g.metrics[id].recent.median === null
                ? "unavailable"
                : format(id, g.metrics[id].recent.median!)}{" "}
              · eligible samples {g.metrics[id].earlier.sample} /{" "}
              {g.metrics[id].recent.sample}.{" "}
              <span className="t-dim">{METRICS[id].definition}</span>
            </p>
          ))}
          <details>
            <summary>Supporting attempts / {g.evidence.length}</summary>
            {g.evidence.map((a) => (
              <p key={a.attempt}>
                <a
                  className="t-cmd"
                  href={`#${attemptAnchor(a)}`}
                  onClick={() => queueMicrotask(revealAttempt)}
                >
                  {a.window} · {a.started.slice(0, 10)} · {g.challenge}
                </a>
              </p>
            ))}
          </details>
          <p className="t-dim">
            Supporting attempt timelines show the recorded events and
            missingness. Completion-only selection and familiar-task practice
            limit interpretation; no population baseline.
          </p>
        </details>
      ))}
      {history.groups.length > 10 && (
        <p className="t-dim">
          Showing 10 of {history.groups.length} condition groups. Narrow the
          language or attempt filter.
        </p>
      )}
    </section>
  );
}
