"use client";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import { localHistory } from "../../../../packages/developer-profile/history";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import {
  GATED,
  PROFILE_HISTORY_ENABLED,
  METRICS,
  METRIC_VERSION,
  SECTIONS,
  type MetricId,
} from "../../../../packages/developer-profile/registry";
import {
  readProgress,
  PROGRESS_CHANGE,
  type Progress,
} from "../../lib/progress";
import { readProfile, ACCOUNT_CHANGE } from "../../lib/account";
import type { StoredProfile } from "../../lib/profile";
import { languageLabel, type ChallengeSummary } from "../../lib/challenges";

type Snapshot = {
  attempts: AttemptSummary[];
  progress: Progress;
  profile: StoredProfile | null;
  at: string;
};
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
function attemptAnchor(a: AttemptSummary) {
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
export function Dashboard({ catalog }: { catalog: ChallengeSummary[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("all");
  const [practice, setPractice] = useState("all");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const store = await openPracticeStore();
      try {
        const dump = await store.dump();
        setSnapshot({
          attempts: localHistory(dump),
          progress: readProgress(),
          profile: readProfile(),
          at: new Date().toISOString(),
        });
      } finally {
        store.close();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("focus", update);
    window.addEventListener("storage", update);
    window.addEventListener(PROGRESS_CHANGE, update);
    window.addEventListener(ACCOUNT_CHANGE, update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", update);
      window.removeEventListener(PROGRESS_CHANGE, update);
      window.removeEventListener(ACCOUNT_CHANGE, update);
    };
  }, [refresh]);
  useEffect(() => {
    revealAttempt();
    window.addEventListener("hashchange", revealAttempt);
    return () => window.removeEventListener("hashchange", revealAttempt);
  }, [snapshot]);
  const progress = snapshot?.progress ?? {};
  const challenges = catalog.filter(
    (c) => language === "all" || c.language === language,
  );
  const attempts = (snapshot?.attempts ?? []).filter(
    (s) =>
      (language === "all" || challenges.some((c) => c.key === s.challenge)) &&
      (practice === "all" || s.practice === practice),
  );
  const completed = challenges.filter(
    (c) => (progress[c.key]?.completions ?? 0) > 0,
  );
  const unfinished = challenges.filter(
    (c) => progress[c.key] && !progress[c.key].completedAt,
  );
  const unexplored = challenges.filter((c) => !progress[c.key]);
  const eligible = attempts.filter((a) => !a.issues.length);
  const next = unfinished[0] ?? unexplored[0];
  return (
    <main className="term stats">
      <div className="stats-content">
        <p className="t-brand">muscle memory / observed developer profile</p>
        <h1>What your practice shows</h1>
        <p className="t-dim">
          Your work on this device. Evidence of these tasks, with room for
          uncertainty.
        </p>
        <div className="stats-controls">
          <label>
            Language{" "}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="all">All languages</option>
              {[...new Set(catalog.map((c) => c.language).filter(Boolean))].map(
                (l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Attempt evidence{" "}
            <select
              value={practice}
              onChange={(e) => setPractice(e.target.value)}
            >
              <option value="all">All retained</option>
              <option value="repeat">Observed repeats</option>
              <option value="unknown">First / repeat unknown</option>
            </select>
          </label>
          <button
            className="t-cmd"
            onClick={() => void refresh()}
            disabled={loading}
          >
            Refresh local evidence
          </button>
        </div>
        <p role="status" className="t-dim">
          {loading
            ? "Reading local evidence…"
            : error
              ? "Local evidence could not be read. Try refreshing."
              : `Read ${snapshot ? new Date(snapshot.at).toLocaleTimeString() : ""} · ${METRIC_VERSION}`}
          {error && snapshot ? " Previous view is stale." : ""}
        </p>
        {snapshot && (
          <>
            <section aria-labelledby="overview">
              <h2 id="overview"># At a glance</h2>
              <ul className="stats-observations">
                <li>
                  <strong>{completed.length}</strong> challenges completed ·{" "}
                  <strong>{unfinished.length}</strong> attempts unfinished ·{" "}
                  <strong>{unexplored.length}</strong> challenges unexplored. A
                  completed challenge can also have an unfinished repeat.
                </li>
                <li>
                  <strong>{attempts.length}</strong> retained attempt/revision
                  summaries; <strong>{eligible.length}</strong> have contiguous
                  supported capture. Older uploaded history may already be
                  absent.
                </li>
                <li>
                  <strong>
                    {attempts.filter((a) => a.practice === "repeat").length}
                  </strong>{" "}
                  observed repeat attempts. First-ever status is unknown when
                  earlier history cannot be proved.
                </li>
                <li>
                  {snapshot.profile?.stealth
                    ? "Stealth is on. Your private evidence stays available; human and model comparisons are hidden."
                    : "Human comparisons await an approved privacy threshold and eligible cohorts. Model comparisons await verified compatible receipts."}
                </li>
              </ul>
              <p>
                {next ? (
                  <Link className="t-cmd" href={`/challenges/${next.key}`}>
                    {unfinished.length
                      ? `Return to ${next.key}`
                      : `Explore ${next.key}`}{" "}
                    →
                  </Link>
                ) : (
                  <Link className="t-cmd" href="/challenges">
                    Explore challenges →
                  </Link>
                )}{" "}
                <span className="t-dim">
                  {unfinished.length
                    ? "Continue unresolved work; a return adds evidence about revisiting this task."
                    : unexplored.length
                      ? "A fresh task broadens task coverage; it does not unlock a rank."
                      : "Later repeats add familiar-task evidence; keep them separate from fresh tasks."}
                </span>
              </p>
            </section>
            <details className="stats-section">
              <summary>
                Progress{" "}
                <span className="t-dim">/ coverage, not global competence</span>
              </summary>
              <p className="t-dim">
                From device progress and current catalog metadata. Prior
                completions may use earlier revisions. Unexplored is not failed.
              </p>
              <Coverage
                label="All selected challenges"
                items={challenges}
                progress={progress}
              />
              {(["language", "difficulty", "tags"] as const).map((field) => (
                <div key={field}>
                  <h3>
                    {field === "tags"
                      ? "Topics"
                      : field === "language"
                        ? "Languages"
                        : "Difficulty"}
                  </h3>
                  {[
                    ...new Set(
                      challenges.flatMap((c) =>
                        field === "tags"
                          ? [...c.tags]
                          : [c[field] ?? "unspecified"],
                      ),
                    ),
                  ].map((value) => (
                    <Coverage
                      key={value}
                      label={
                        field === "language" ? languageLabel(value) : value
                      }
                      items={challenges.filter((c) =>
                        field === "tags"
                          ? c.tags.includes(value)
                          : c[field] === value,
                      )}
                      progress={progress}
                    />
                  ))}
                </div>
              ))}
              <details>
                <summary>Challenge evidence and next actions</summary>
                {challenges.map((c) => (
                  <p key={c.key}>
                    <Link className="t-cmd" href={`/challenges/${c.key}`}>
                      {c.key} · {c.title}
                    </Link>{" "}
                    —{" "}
                    {progress[c.key]
                      ? `${progress[c.key].completions} completions; ${progress[c.key].completedAt ? "latest completed" : "unfinished attempt"}`
                      : "unexplored"}
                  </p>
                ))}
              </details>
            </details>
            {SECTIONS.map((section) => (
              <details className="stats-section" key={section}>
                <summary>{section}</summary>
                <p className="t-dim">
                  Each value uses only eligible retained attempts. Pooled
                  medians describe the selected task mix; they are not a growth
                  comparison. Filter observed repeats separately. Expand a
                  metric for its definition, missing evidence and supporting
                  timelines. Baseline: your own attempts.
                </p>
                <div className="stats-metrics">
                  {(Object.keys(METRICS) as MetricId[])
                    .filter((id) => METRICS[id].section === section)
                    .map((id) => (
                      <Metric key={id} id={id} attempts={attempts} />
                    ))}
                </div>
                {GATED.filter((g) => g[0] === section).map((g) => (
                  <details key={g[1]} className="stats-metric">
                    <summary>
                      {g[1]} <span className="t-dim">— unavailable</span>
                    </summary>
                    <p>{g[2]}</p>
                    <p className="t-dim">
                      Eligible sample: unavailable. Playing more cannot repair
                      missing capture or an unvalidated definition.
                    </p>
                  </details>
                ))}
                {section === "Reflection / growth" && (
                  <>
                    <h3>Optional reflections</h3>
                    <p className="t-dim">
                      Retrospective answers from successful completers only.
                      These are not prospective predictions, calibration or an
                      overconfidence score.
                    </p>
                    {attempts
                      .filter((a) => Object.keys(a.answers).length)
                      .map((a) => (
                        <p key={`${a.attempt}:${a.revision}`}>
                          <a
                            className="t-cmd"
                            href={`#${attemptAnchor(a)}`}
                            onClick={() => queueMicrotask(revealAttempt)}
                          >
                            {a.challenge}
                          </a>{" "}
                          · completed ·{" "}
                          {Object.entries(a.answers)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </p>
                      ))}
                    {!attempts.some((a) => Object.keys(a.answers).length) && (
                      <p>
                        No retained post-completion answers. You may answer the
                        optional questions after completing a challenge.
                      </p>
                    )}
                  </>
                )}
              </details>
            ))}
            <details className="stats-section" id="comparisons">
              <summary>Human / model comparisons</summary>
              <Comparison stealth={!!snapshot.profile?.stealth} />
              {!snapshot.profile?.stealth && (
                <>
                  <p>
                    Comparable means the same task and tests revision,
                    language/runtime, tool and assistance condition, with
                    repeats separate and relevant voluntary context. Human
                    elapsed time and model latency are different measures.
                  </p>
                  <p>
                    More comparable participants are needed for a human
                    baseline; one person adding demographics cannot supply a
                    cohort. Small intersected groups and 16–17-year-olds require
                    separate safeguards.
                  </p>
                  <p>
                    Optional experience, language familiarity and role context
                    can help describe a future comparison. All existing stats
                    remain available.{" "}
                    <Link className="t-cmd" href="/settings/profile">
                      Edit or skip profile answers →
                    </Link>
                  </p>
                  <p className="t-dim">
                    Uses the existing settings questions; no extra collection or
                    repeated prompt. No percentile is promised.
                  </p>
                </>
              )}
            </details>
            <details className="stats-section">
              <summary>
                Supporting attempt timelines{" "}
                <span className="t-dim">/ {attempts.length} retained</span>
              </summary>
              <p className="t-dim">
                Source sequence orders each page session; wall clock orders page
                resumes. Cross-source clock order is approximate. Timelines keep
                the latest 200 checkpoints per attempt; no code or output is
                shown.
              </p>
              {attempts.length ? (
                attempts.map((a) => (
                  <Attempt key={`${a.attempt}:${a.revision}`} attempt={a} />
                ))
              ) : (
                <p>
                  No retained practice evidence yet. Start a challenge to build
                  your private observed profile.
                </p>
              )}
            </details>
            <details className="stats-section">
              <summary>Evidence coverage and privacy</summary>
              <p>
                {PROFILE_HISTORY_ENABLED
                  ? "Code-free summaries are retained before future raw compaction."
                  : "History summary retention is disabled under the current latest-attempt-only Privacy Notice. Enabling it requires an approved storage disclosure; playing more cannot recover compacted history."}{" "}
                Older compacted history cannot be reconstructed here. This is
                not a complete account history or a server read path.
              </p>
              <p>
                Capture gaps, missing starts, conflicts and unsupported capture
                versions withhold derived metrics. Oversized edit changes
                withhold volume; a missing value is never replaced with zero. No
                final-page capture can prove a complete unseen tail.
              </p>
              <p>
                Summaries contain counts, conditions, optional attempt answers
                and bounded checkpoint labels; no code, raw keys or output. They
                stay on this device, travel in your private backup and are
                removed by reset or account deletion. No player ID is treated as
                authentication. No public aggregate endpoint or derived server
                store is added.
              </p>
              <p>
                These observations do not measure intelligence, attention, AI
                dependence or causal effects. No recorded editor help is not
                proof of no external assistance.
              </p>
              <Link className="t-cmd" href="/settings">
                Manage your data →
              </Link>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
function Coverage({
  label,
  items,
  progress,
}: {
  label: string;
  items: ChallengeSummary[];
  progress: Progress;
}) {
  const done = items.filter(
    (c) => (progress[c.key]?.completions ?? 0) > 0,
  ).length;
  const width = 16,
    filled = items.length ? Math.round((done / items.length) * width) : 0;
  return (
    <p className="stats-coverage">
      <span>{label}</span>
      <span className="t-ok" aria-hidden>
        {"█".repeat(filled)}
        <span className="t-dim">{"░".repeat(width - filled)}</span>
      </span>
      <span>
        {done}/{items.length} completed ·{" "}
        {
          items.filter((c) => progress[c.key] && !progress[c.key].completedAt)
            .length
        }{" "}
        unfinished
      </span>
    </p>
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
export function Comparison({ stealth }: { stealth: boolean }) {
  return (
    <div role="note">
      {stealth ? (
        <p>
          Stealth: human and model comparisons are hidden. Your own results
          remain private and available.
        </p>
      ) : (
        <>
          <p>
            Humans — suppressed. A privacy-safe minimum cohort size has not been
            approved. There is no released eligible human baseline.
          </p>
          <p>
            Models — unavailable. The operator ledger is not a verified
            participant-facing receipt. Missing, queued, stopped,
            budget-limited, refused and infrastructure-failed slots must stay
            distinct. A single observed try per exact model/version and
            reasoning setting is not a stable success probability.
          </p>
          <p className="t-dim">
            No comparison fetch is attempted. There is no cached comparison to
            show; refresh reads private local evidence only. Release needs an
            allowlisted receipt reader with exact protocol/runtime/tool matching
            (ENG-342).
          </p>
        </>
      )}
    </div>
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
