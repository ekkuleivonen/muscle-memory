"use client";
import { useState } from "react";
import type { StatisticsState } from "../../../lib/admin-statistics";
import type { StatsWindow } from "../../../../../packages/statistics/query";
import {
  completionRate,
  type StatsRow,
} from "../../../../../packages/statistics/result";

export function Statistics({
  window,
  state,
  error,
  titles,
}: {
  window: StatsWindow;
  state: StatisticsState;
  error?: string;
  titles: Record<string, { title: string; revision: string }>;
}) {
  const [sort, setSort] = useState("starts");
  const result = state.status === "ready" ? state.result : null;
  const rows = [...(result?.rows ?? [])].sort((a, b) => {
    const metric = (r: StatsRow) =>
      sort === "rate"
        ? r.starts
          ? r.completions / r.starts
          : -1
        : r[sort as "starts" | "completions" | "runs"];
    return (
      (sort === "challenge" ? 0 : metric(b) - metric(a)) ||
      a.challenge.localeCompare(b.challenge) ||
      a.revision.localeCompare(b.revision)
    );
  });
  return (
    <>
      <h1>Challenge statistics</h1>
      <p>
        Recorded browser activity, grouped by exact challenge revision. Browser
        IDs are not unique people.
      </p>
      <p className="admin-stats-notice">
        Known synthetic-QA challenge revisions are excluded. Remaining activity
        has unknown provenance: this archive does not reliably distinguish
        player, operator, synthetic or model activity. These are not human-only
        statistics.
      </p>
      <form
        className="admin-stats-filters"
        action="/admin/statistics"
        method="get"
      >
        <label>
          From (UTC)
          <input name="from" type="date" defaultValue={window.from} required />
        </label>
        <label>
          Through (UTC)
          <input name="to" type="date" defaultValue={window.to} required />
        </label>
        <label>
          Challenge ID
          <input
            name="challenge"
            defaultValue={window.challenge}
            placeholder="All recorded challenges"
            maxLength={9}
          />
        </label>
        <label>
          Exact revision
          <input
            name="revision"
            defaultValue={window.revision}
            placeholder="All recorded revisions"
            maxLength={71}
          />
        </label>
        <button
          name="run"
          value="1"
          type="submit"
          disabled={state.status === "unconfigured"}
        >
          Load statistics
        </button>
      </form>
      <p>
        Up to 31 days per query. No automatic refresh; sorting below does not
        query again.
      </p>
      {error && <p role="alert">{error}</p>}
      {state.status === "unconfigured" && (
        <p role="status">
          Statistics access is not configured. No archive query was made; counts
          are unavailable.
        </p>
      )}
      {state.status === "idle" && !error && (
        <p role="status">Choose a date range and load statistics.</p>
      )}
      {state.status === "unavailable" && (
        <p role="alert">
          Statistics could not be loaded. Counts are unavailable, not zero. Try
          a narrower date range or challenge; if that fails, check archive
          access. Nothing was changed.
        </p>
      )}
      {state.status === "ready" && result && (
        <>
          <p>
            Queried at <time>{state.queriedAt}</time>. Window: {window.from}{" "}
            through {window.to}, inclusive UTC days.
          </p>
          <p>
            {result.coverage.observed} deduplicated observations across the date
            window; {result.coverage.duplicates} duplicate deliveries removed;{" "}
            {result.coverage.conflicts} conflicting IDs excluded;{" "}
            {result.coverage.knownSynthetic} known synthetic-QA observations
            excluded; {result.coverage.unsupported} observations with
            unsupported practice capture excluded.
          </p>
          <p>
            First / last observed in this window:{" "}
            {result.coverage.firstObserved ?? "Unavailable"} /{" "}
            {result.coverage.lastObserved ?? "Unavailable"}. Latest upload
            received in this window:{" "}
            {result.coverage.lastReceived ?? "Unavailable"}.
          </p>
          <p>
            Coverage above includes site observations and is independent of the
            challenge/revision filters. The table uses practice capture 1.0 /
            1.1 only. Uploads may be delayed, incomplete or absent; deletion
            follows the archive's existing erasure process.
          </p>
          {rows.length === 0 ? (
            <p role="status">
              No supported challenge activity is recorded for these filters.
              This does not establish zero plays.
            </p>
          ) : (
            <>
              <label htmlFor="admin-stats-sort">Sort rows</label>{" "}
              <select
                id="admin-stats-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="starts">Recorded starts</option>
                <option value="completions">Recorded solves</option>
                <option value="rate">Completion rate</option>
                <option value="runs">Test runs requested</option>
                <option value="challenge">Challenge ID</option>
              </select>
              <div
                className="admin-inventory admin-stats-table"
                role="region"
                aria-label="Challenge statistics"
                tabIndex={0}
              >
                <table>
                  <caption>
                    Each row is one revision. Distinct browser-ID counts cannot
                    be added across rows.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Challenge / revision</th>
                      <th scope="col">Starts</th>
                      <th scope="col">Browser IDs at start</th>
                      <th scope="col">Solves</th>
                      <th scope="col">Completion rate</th>
                      <th scope="col">Submissions</th>
                      <th scope="col">Runs requested</th>
                      <th scope="col">Attempts missing start</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.challenge + r.revision}>
                        <th scope="row">
                          {r.challenge}
                          {titles[r.challenge]?.revision === r.revision && (
                            <p>{titles[r.challenge].title}</p>
                          )}
                          <details>
                            <summary>{r.revision.slice(0, 19)}…</summary>
                            <code>{r.revision}</code>
                          </details>
                        </th>
                        <td>{r.starts}</td>
                        <td>{r.browserIds}</td>
                        <td>{r.completions}</td>
                        <td>{completionRate(r)}</td>
                        <td>{r.submissions}</td>
                        <td>{r.runs}</td>
                        <td>{r.missingStarts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <details className="admin-stats-definitions">
        <summary>Definitions and limits</summary>
        <ul>
          <li>
            Duplicate and conflict detection applies to deliveries within the
            selected date window, not the entire archive.
          </li>
          <li>
            Start: distinct participant-ID + attempt-ID + challenge + revision
            with a recorded practice.started in the window. Reopening an attempt
            is not another start.
          </li>
          <li>
            Solve: one recorded practice.completed at or after its matching
            start, both in the window. This is a browser-reported completion,
            not independent server grading.
          </li>
          <li>
            Completion rate: matched completed attempts / recorded started
            attempts, with numerator and denominator shown. It is window-bound,
            not eventual success or abandonment; work begun before or completed
            after this window may be missing.
          </li>
          <li>
            Submissions: distinct Submit run IDs. Runs requested: distinct run
            IDs with a queued status (examples and Submit); queued does not mean
            executed successfully. Runs and submissions can include attempts
            whose start is missing.
          </li>
          <li>
            Attempts missing start: recorded opens, runs, submissions or
            completions without a start in this window. They are excluded from
            the rate denominator.
          </li>
          <li>
            Play rate, unique people, first-ever versus repeat players, active
            time and abandonment are unavailable here. Time-to-solve is omitted
            rather than inferred from incomplete streams.
          </li>
          <li>
            No synthetic or model exclusions are guessed from names, speed or
            code. No benchmark runs or new events are produced by this view.
          </li>
        </ul>
      </details>
    </>
  );
}
