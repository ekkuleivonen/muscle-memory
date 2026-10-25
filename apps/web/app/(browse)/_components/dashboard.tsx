"use client";
import Link from "next/link";
import { useMemo } from "react";
import {
  actionsPerDay,
  activeDays,
  greeting,
  heatmap,
  recentActivity,
  timeAgo,
  type ActivityEntry,
} from "../../../lib/activity";
import { boardIssues, type Status } from "../../../lib/board";
import {
  issueHref,
  languageLabel,
  type IssueSummary as Issue,
} from "../../../lib/library";
import type { LanguageId } from "../../../lib/languages";
import { emptyIssueQuery, href } from "../../../lib/queries";
import { LanguageDot } from "./bits";
import { Ask } from "./ask";
import { StartWork, useBoard } from "./board";
import { Suggestions } from "./board-view";
import { StatusIcon } from "./icons";
import { IssueRows } from "./issue-list";
import { useAccount } from "./profile-menu";
import { pullHref } from "./pulls";
import { useNow, useRecords } from "./records";

/**
 * Home: a greeting, where you stand, what to pick up next, and what you have been doing.
 * Only things this browser actually knows; no invented numbers.
 */
export function Dashboard({
  issues,
  discoverable,
}: {
  issues: Issue[];
  discoverable: Issue[];
}) {
  const account = useAccount();
  const { items, hydrated } = useBoard();
  const records = useRecords();
  const now = useNow();
  const onBoard = boardIssues(items, issues);
  const inStatus = (status: Status) =>
    onBoard.filter((b) => b.status === status).map((b) => b.issue);
  const inProgress = inStatus("in-progress");
  const todo = inStatus("todo");
  const doneCount = inStatus("done").length;
  // Points still to deliver: Done issues have left the queue.
  const points = onBoard
    .filter((b) => b.status !== "done")
    .reduce((sum, b) => sum + (b.issue.estimate ?? 0), 0);
  const counts = useMemo(
    () => (records ? actionsPerDay(records) : new Map<string, number>()),
    [records],
  );
  const handle = account?.handle;

  if (!hydrated || !account || !records)
    return (
      <p role="status" className="loading-state">
        Reading your practice history…
      </p>
    );
  const resume = inProgress[0] ?? todo[0];
  return (
    <div className="dashboard">
      <header className="dash-head">
        <h1>
          {now ? greeting(now) : "Hello"}
          {handle && (
            <>
              , <span className="handle">{handle}</span>
            </>
          )}
        </h1>
        <p className="dim">
          {now?.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {now && " · "}
          {inProgress.length
            ? `${inProgress.length} in progress, ${todo.length} up next`
            : todo.length
              ? `${todo.length} up next, nothing started yet`
              : "Your board is empty: pick something below."}
        </p>
      </header>

      <section className="practice-next">
        <h2>
          {resume
            ? "Pick up where you left off"
            : doneCount
              ? "Ready for another issue?"
              : "Your first practice session"}
        </h2>
        {resume ? (
          <>
            <p>
              {resume.key} · {resume.title}
            </p>
            <StartWork issue={resume} href={`/work/${resume.key}`} />
          </>
        ) : (
          <>
            <p>
              Read a ticket, change the code, run tests and merge your fix.
              Start with one small bug; there is no timer.
            </p>
            <Link className="btn start" href="/play">
              Try the five-minute test →
            </Link>{" "}
            <Link href="/issues">Browse all issues</Link>
          </>
        )}
        <p className="dim">
          Saved in this browser. Keep using this browser and device to return to
          your code. Uploads are not a backup.
        </p>
      </section>
      {onBoard.length > 0 && (
        <div className="stats">
          <Stat
            label="In progress"
            value={inProgress.length}
            status="in-progress"
          />
          <Stat label="Todo" value={todo.length} status="todo" />
          <Stat
            label="Done"
            value={doneCount}
            status="done"
            hint={
              doneCount
                ? "merged by you"
                : "lands when you merge a pull request"
            }
          />
          <Stat label="Points on your board" value={points} />
          <Stat
            label="Days using the app"
            value={records && now ? activeDays(counts, now) : "…"}
            hint="includes browsing · last 30 days"
          />
        </div>
      )}

      <div className="dash-grid">
        <div className="dash-main">
          {inProgress.length > 0 && (
            <section className="section">
              <h2>
                Continue <span className="count">{inProgress.length}</span>
              </h2>
              {inProgress.length ? (
                <IssueRows issues={inProgress} standalone />
              ) : (
                <p className="dim">
                  Nothing in progress.{" "}
                  {todo.length
                    ? "Open one from Up next and set it to In progress (s)."
                    : "Move something to Todo first."}
                </p>
              )}
            </section>
          )}
          {todo.length > 0 && (
            <section className="section">
              <h2>
                Up next <span className="count">{todo.length}</span>
                {onBoard.length > 0 && (
                  <Link className="see-all" href="/board">
                    Open board →
                  </Link>
                )}
              </h2>
              {todo.length ? (
                <IssueRows issues={todo} standalone />
              ) : (
                <p className="dim">
                  Nothing in Todo. Open an issue and set its status with{" "}
                  <kbd>s</kbd>.
                </p>
              )}
            </section>
          )}
          <section className="section">
            <h2>
              Suggested for you
              <Link className="see-all" href="/issues">
                All issues →
              </Link>
            </h2>
            <p className="dim">
              Unstarted issues, prioritising runnable issues and easier
              difficulty
              {account.profile.languages?.length
                ? ", prioritising your languages"
                : " across languages"}
              . Points indicate relative complexity, not minutes.
            </p>
            <Ask ids={["languages"]} from="dashboard" />
            <Suggestions issues={discoverable} />
          </section>
        </div>

        {onBoard.length > 0 && (
          <aside className="dash-side">
            <section className="section">
              <h2>Activity</h2>
              {now && <Heatmap counts={counts} now={now} />}
            </section>
            <section className="section">
              <h2>Recent</h2>
              <Feed
                entries={records ? recentActivity(records) : null}
                issues={issues}
                now={now}
              />
            </section>
            <section className="section">
              <h2>
                Your stack
                <Link className="see-all" href="/settings#languages">
                  Change →
                </Link>
              </h2>
              <Stack
                languages={account?.profile.languages ?? []}
                issues={discoverable}
              />
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  status,
  hint,
}: {
  label: string;
  value: number | string;
  status?: Status;
  hint?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">
        {status && <StatusIcon status={status} />} {label}
      </span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

function Heatmap({
  counts,
  now,
}: {
  counts: ReadonlyMap<string, number>;
  now: Date;
}) {
  const weeks = heatmap(counts, now);
  const label = (day: string, count: number) =>
    `${count || "No"} action${count === 1 ? "" : "s"} on ${new Date(
      `${day}T12:00:00`,
    ).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })}`;
  return (
    <div className="heatmap">
      <div
        className="heat-grid"
        role="img"
        aria-label="Activity over the last 15 weeks"
      >
        {weeks.map((week) => (
          <div className="heat-week" key={week[0].day}>
            {week.map((d) =>
              d.future ? (
                <span key={d.day} className="heat-day future" />
              ) : (
                <span
                  key={d.day}
                  className={`heat-day l${d.level}`}
                  title={label(d.day, d.count)}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="heat-legend">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat-day l${l}`} />
        ))}
        More
      </div>
    </div>
  );
}

const MOVED_TO: Record<string, string> = {
  backlog: "back to Backlog",
  todo: "to Todo",
  "in-progress": "to In progress",
};

function Feed({
  entries,
  issues,
  now,
}: {
  entries: ActivityEntry[] | null;
  issues: Issue[];
  now: Date | null;
}) {
  if (!entries || !now) return <p className="dim">…</p>;
  if (!entries.length)
    return (
      <p className="dim">
        Nothing yet. Status changes and runs show up here as you go.
      </p>
    );
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const bySlug = new Map(issues.map((i) => [i.slug, i]));
  return (
    <ul className="feed">
      {entries.map((entry, index) => {
        const issue =
          entry.kind === "moved"
            ? byKey.get(entry.key)
            : bySlug.get(entry.issueId);
        const ref = issue ? (
          <Link href={issueHref(issue)}>{issue.key}</Link>
        ) : (
          <span>{entry.kind === "moved" ? entry.key : entry.issueId}</span>
        );
        return (
          <li key={index}>
            {entry.kind === "moved" ? (
              <StatusIcon status={entry.to as Status} />
            ) : (
              <span className="feed-dot" aria-hidden />
            )}
            <span className="feed-text">
              {entry.kind === "moved" &&
                (entry.to === "done" ? (
                  entry.pullRequest ? (
                    <>
                      Merged{" "}
                      <PullLink
                        entry={{ number: entry.pullRequest }}
                        issue={issue}
                      />{" "}
                      for {ref}
                    </>
                  ) : (
                    <>Finished {ref}</>
                  )
                ) : (
                  <>
                    Moved {ref} {MOVED_TO[entry.to] ?? `to ${entry.to}`}
                  </>
                ))}
              {entry.kind === "opened" && <>Opened {ref} in the IDE</>}
              {entry.kind === "pull-request" && (
                <>
                  {entry.push > 1 ? "Pushed to" : "Opened"}{" "}
                  <PullLink entry={entry} issue={issue} /> for {ref}:{" "}
                  {entry.result === "checks-passed" || entry.result === "merged"
                    ? `checks passed (${entry.passed}/${entry.total})`
                    : entry.result === "checks-failed"
                      ? `checks failed (${entry.passed}/${entry.total})`
                      : entry.result === "cancelled"
                        ? "checks cancelled"
                        : "checks errored"}
                </>
              )}
              {entry.kind === "ran" && (
                <>
                  Ran {ref}
                  {entry.status !== "result" &&
                    ` (${entry.status.replace("-", " ")})`}
                </>
              )}
            </span>
            <time className="faint" dateTime={entry.at}>
              {timeAgo(entry.at, now)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

function Stack({
  languages,
  issues,
}: {
  languages: readonly LanguageId[];
  issues: Issue[];
}) {
  if (!languages.length)
    return (
      <p className="dim">
        No languages picked. Add some in{" "}
        <Link href="/settings#languages">settings</Link> to get suggestions that
        fit.
      </p>
    );
  return (
    <ul className="stack">
      {languages.map((id) => {
        const count = issues.filter((i) => i.language === id).length;
        return (
          <li key={id}>
            <Link
              href={href("/issues", { ...emptyIssueQuery(), language: [id] })}
            >
              <LanguageDot language={id} /> {languageLabel(id)}
            </Link>
            <span className="faint">
              {count} issue{count === 1 ? "" : "s"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "pull request #2", linked to its page when the issue is known. */
function PullLink({
  entry,
  issue,
}: {
  entry: { number: number };
  issue?: Issue;
}) {
  const text = `pull request #${entry.number}`;
  return issue ? (
    <Link href={pullHref(issue.key, entry.number)}>{text}</Link>
  ) : (
    <>{text}</>
  );
}
