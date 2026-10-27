"use client";
import Link from "next/link";
import { UploadedHistoryControl } from "./uploaded-history";
import type { UploadedHistory } from "../../../../packages/developer-profile/uploaded-history";
import { flushSync } from "react-dom";
import { AttemptModelComparisons } from "./model-comparisons";
import React, {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  personalObservations,
  evidenceActions,
} from "../../lib/personal-observations";
import { privateView } from "../../../../packages/developer-profile/private-view";
import { listenPrivateBoundary } from "../../lib/private-boundary";
import { PROFILE_KEY } from "../../lib/profile";
import { PROGRESS_KEY } from "../../lib/progress";
import { acceptsCurrent } from "../../lib/legal";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import { repeatHistory } from "../../../../packages/developer-profile/longitudinal";
import { localHistory } from "../../../../packages/developer-profile/history";
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
export function Dashboard({ catalog }: { catalog: ChallengeSummary[] }) {
  const [view] = useState(() => privateView<Snapshot>());
  const state = useSyncExternalStore(
    view.subscribe,
    view.getSnapshot,
    view.getSnapshot,
  );
  const { value: snapshot, error, loading } = state;
  const [uploaded, setUploaded] = useState<UploadedHistory | null>(null);
  const [language, setLanguage] = useState("all");
  const [practice, setPractice] = useState("all");
  const refresh = useCallback(async () => {
    let account;
    try {
      account = readProfile();
    } catch {
      view.invalidate();
      await view.read(async () => {
        throw new Error("Privacy settings could not be read.");
      });
      return;
    }
    if (!account || account.signedOut || !acceptsCurrent(account.accepted)) {
      view.invalidate();
      return;
    }
    await view.read(async () => {
      const store = await openPracticeStore();
      try {
        const dump = await store.dump();
        return {
          attempts: localHistory(dump),
          progress: readProgress(),
          profile: readProfile(),
          at: new Date().toISOString(),
        };
      } finally {
        store.close();
      }
    });
  }, [view]);
  useEffect(() => {
    void refresh();
    const transient = () => void refresh();
    const boundary = () => {
      flushSync(() => view.invalidate());
      void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === PROFILE_KEY ||
        event.key === PROGRESS_KEY
      )
        boundary();
    };
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start") flushSync(() => view.invalidate(true));
      else view.release(); // Completion events trigger a fresh read only after clearing succeeded.
    });
    window.addEventListener("focus", transient);
    window.addEventListener("storage", storage);
    window.addEventListener(PROGRESS_CHANGE, boundary);
    window.addEventListener(ACCOUNT_CHANGE, boundary);
    return () => {
      stop();
      view.invalidate();
      window.removeEventListener("focus", transient);
      window.removeEventListener("storage", storage);
      window.removeEventListener(PROGRESS_CHANGE, boundary);
      window.removeEventListener(ACCOUNT_CHANGE, boundary);
    };
  }, [refresh, view]);
  useEffect(() => {
    revealAttempt();
    window.addEventListener("hashchange", revealAttempt);
    return () => window.removeEventListener("hashchange", revealAttempt);
  }, [snapshot]);
  const progress = snapshot?.progress ?? {};
  const challenges = catalog.filter(
    (c) => language === "all" || c.language === language,
  );
  const attempts = (uploaded?.attempts ?? snapshot?.attempts ?? []).filter(
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
  const observations = personalObservations(attempts);
  const actions = evidenceActions(
    challenges,
    progress,
    snapshot?.attempts ?? [],
  );
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
        <UploadedHistoryControl onChange={setUploaded} />
        {snapshot && (
          <>
            <section aria-labelledby="overview">
              <h2 id="overview"># At a glance</h2>
              <p className="t-dim">
                {completed.length} completed challenges · {unfinished.length}{" "}
                unfinished attempts · {unexplored.length} unexplored.{" "}
                {attempts.length} {uploaded ? "uploaded" : "device-retained"}{" "}
                attempt/revision traces. Progress counts above remain
                device-local.{" "}
                {uploaded
                  ? "Uploaded history is separate, may span multiple pages and may lag recent activity."
                  : ""}{" "}
                First/repeat status stays unknown when older history is missing.
              </p>
              <div className="stats-observations">
                {observations.map((o) => (
                  <article className="stats-metric" key={o.id}>
                    <p>
                      <strong>{o.title}.</strong> {o.text}
                    </p>
                    <details>
                      <summary>Definition and supporting evidence</summary>
                      <p className="t-dim">
                        Definition: {o.definition} Supporting sample:{" "}
                        {o.evidence.length} / {attempts.length} retained
                        attempts; {o.missing} missing/ineligible. Baseline: your
                        own selected task mix only.
                      </p>
                      {o.evidence.map((a) => (
                        <p key={`${a.attempt}:${a.revision}`}>
                          <a
                            className="t-cmd"
                            href={`#${attemptAnchor(a)}`}
                            onClick={() => queueMicrotask(revealAttempt)}
                          >
                            {a.challenge} ·{" "}
                            {a.practice === "repeat"
                              ? "repeat"
                              : "first/repeat unknown"}
                          </a>
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
              </div>
              <h3>What would add useful evidence / device progress</h3>
              {actions.map((a) => (
                <p key={a.href}>
                  <Link className="t-cmd" href={a.href}>
                    {a.label} →
                  </Link>{" "}
                  {a.why}
                </p>
              ))}
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
                    <RepeatHistory
                      attempts={attempts}
                      until={uploaded?.readAt ?? snapshot.at}
                    />
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
              <AttemptModelComparisons
                attempts={attempts.filter((a) =>
                  a.revision.startsWith("sha256:"),
                )}
                stealth={!!snapshot.profile?.stealth}
              />
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
              <summary id="evidence-coverage">
                Evidence coverage and privacy
              </summary>
              <p>
                Local historical summary retention remains disabled. Browser
                compaction keeps the latest uploaded attempt per challenge. Use
                Load uploaded history to inspect earlier existing uploads; that
                private view stays in page memory and never restores device
                progress. Missing uploads cannot be recovered here.
              </p>
              <p>
                Capture gaps, missing starts, conflicts and unsupported capture
                versions withhold derived metrics. Oversized edit changes
                withhold volume; a missing value is never replaced with zero. No
                final-page capture can prove a complete unseen tail.
              </p>
              <p>
                Summaries contain counts, conditions, optional attempt answers
                and bounded checkpoint labels; no code, raw keys or output. The
                uploaded view is not saved in your browser or backup. Reset,
                logout, privacy changes and deletion clear it; further uploaded
                reads require another explicit action. Existing raw-upload
                retention is unchanged. No player ID is treated as
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
            Models — stored observed tries are loaded for the selected exact
            task revision below. Missing, queued, stopped, budget-limited,
            refused and infrastructure-failed slots stay distinct. A single
            observed try per exact model/version and reasoning setting is not a
            stable success probability.
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
          Matched repeated-task history is unavailable in the retained evidence.
          Use Load uploaded history for earlier existing uploads, then look for
          repeats under the same recorded conditions. Playing more cannot
          reconstruct already-compacted history.
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
          language/attempt filter for this view.
        </p>
      )}
    </section>
  );
}
