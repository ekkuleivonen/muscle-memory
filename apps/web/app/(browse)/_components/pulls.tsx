"use client";
import { tabKeys } from "../../../lib/tab-keys";
import { nextProblem } from "../../../lib/next-problem";
import { useAccount } from "./profile-menu";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  editableFiles,
  type Revision,
} from "../../../../../packages/content/model";
import { timeAgo } from "../../../lib/activity";
import type { IssueSummary } from "../../../lib/library";
import { filterPulls, href, type PullQuery } from "../../../lib/queries";
import { diffLines, diffStats, hunks } from "../../../lib/diff";
import {
  allPullRequests,
  duration,
  pullRequestDetail,
  type PullDetail,
  type PullSummary,
  type TimelineEntry,
} from "../../../lib/pulls";
import { LanguageTag } from "./bits";
import { StartWork, useBoard } from "./board";
import { setIssueContext } from "./board-log";
import { Ask } from "./ask";
import { Markdown } from "./markdown";
import { PullOutcome } from "./pull-outcome";
import { Checks, Findings } from "./review";
import { useResult } from "./result-card";
import { CopyIssueLink, ShareResult } from "./share";
import { tryHref } from "../../../lib/share";
import { useNow, useRecords } from "./records";
import { feedbackOf, type Thread } from "../../../lib/feedback";
import { attemptRecords } from "../../../lib/attempts";

export interface PullIssue {
  key: string;
  slug: string;
  title: string;
  /** The live revision; the list does not need it. */
  revision?: string;
}

/** The IDE on the issue's live revision; pushes still go to the open pull request. */
const workHref = (issue: PullIssue) => `/work/${issue.key}`;

type State = PullSummary["state"];
const STATE_LABELS: Record<State, string> = {
  open: "Open",
  merged: "Merged",
  closed: "Closed",
};
/** Passing checks; before capture 1.4.0 they were recorded as `merged`. */
const passed = (result: string) =>
  result === "checks-passed" || result === "merged";

export function pullHref(key: string, number: number) {
  return `/pulls/${key}/${number}`;
}

/** Open: a branch heading back. Merged: two branches joined. */
export function PullIcon({
  state,
  size = 16,
}: {
  state: State;
  size?: number;
}) {
  return (
    <svg
      className={`pull-icon ${state}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="4.5" cy="3.5" r="1.7" />
      <circle cx="4.5" cy="12.5" r="1.7" />
      {state === "closed" ? (
        <>
          <path d="M4.5 5.2v5.6" />
          <path d="M10 3.5l3 3M13 3.5l-3 3" />
          <circle cx="11.5" cy="12.5" r="1.7" />
          <path d="M11.5 10.8V9" />
        </>
      ) : state === "merged" ? (
        <>
          <circle cx="11.5" cy="8" r="1.7" />
          <path d="M4.5 5.2v5.6M4.5 5.5c0 2.5 2.5 2.5 5.3 2.5" />
        </>
      ) : (
        <>
          <circle cx="11.5" cy="12.5" r="1.7" />
          <path d="M4.5 5.2v5.6M11.5 10.8V6.5a2 2 0 0 0-2-2H7.5" />
          <path d="M9 3l-1.5 1.5L9 6" />
        </>
      )}
    </svg>
  );
}

function checksText(pull: Pick<PullSummary, "result" | "passed" | "total">) {
  if (pull.result === "checks-errored") return "checks errored";
  if (pull.result === "cancelled") return "checks cancelled";
  return `${pull.passed}/${pull.total} checks`;
}

/**
 * Every pull request in this browser, filtered by the same kind of query as issues
 * (is:open checks:failed lang:go …). The query comes from the URL; the pull requests from
 * this browser, so the filtering happens here.
 */
export function PullList({
  issues,
  query,
}: {
  issues: IssueSummary[];
  query: PullQuery;
}) {
  const records = useRecords();
  const now = useNow();
  const bySlug = useMemo(
    () => new Map(issues.map((i) => [i.slug, i])),
    [issues],
  );
  const pulls = useMemo(
    () =>
      (records ? allPullRequests(records) : []).map(
        ({ issue: id, ...pull }) => ({ ...pull, id, issue: bySlug.get(id) }),
      ),
    [records, bySlug],
  );
  if (!records || !now)
    return (
      <p className="loading-state" role="status">
        Reading your pull requests…
      </p>
    );
  if (!pulls.length)
    return (
      <p className="empty">
        No pull requests yet. When your code is ready in the IDE, open one: CI
        runs every check, then you review it here and merge it.
      </p>
    );
  // The state tabs count within the other filters, as GitHub's Open and Closed do.
  const others = filterPulls(pulls, { ...query, state: [] });
  const shown = filterPulls(pulls, query);
  const tab = (state: State | null, label: string) => {
    const selected =
      state === null
        ? query.state.length === 0
        : query.state.length === 1 && query.state[0] === state;
    const n =
      state === null
        ? others.length
        : others.filter((p) => p.state === state).length;
    return (
      <Link
        key={label}
        role="tab"
        aria-selected={selected}
        href={href("/pulls", { ...query, state: state ? [state] : [] })}
        scroll={false}
      >
        {state && <PullIcon state={state} size={14} />} {label}{" "}
        <span className="count">{n}</span>
      </Link>
    );
  };
  return (
    <>
      <div className="pull-filter" role="tablist" aria-label="State">
        {tab(null, "All")}
        {tab("open", "Open")}
        {tab("merged", "Merged")}
      </div>
      {shown.length === 0 ? (
        <p className="empty pull-empty">
          No pull requests match this search. Remove a filter or try fewer
          words.
        </p>
      ) : (
        <ul className="rows">
          {shown.map((pull) => {
            const key = pull.issue?.key ?? pull.id;
            return (
              <li key={`${pull.id}#${pull.number}`}>
                <Link
                  className="row pull-row"
                  href={pullHref(key, pull.number)}
                  data-row
                >
                  <PullIcon state={pull.state} />
                  <span className="title">
                    {pull.issue?.title ?? pull.id}{" "}
                    <span className="faint">#{pull.number}</span>
                  </span>
                  <span className="meta dim">
                    {pull.issue && (
                      <LanguageTag language={pull.issue.language} />
                    )}
                    <span className="mono">{key}</span> · {checksText(pull)} ·{" "}
                    <time dateTime={pull.at}>{timeAgo(pull.at, now)}</time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** The issue's pull requests, newest first, in its properties like a linked branch. */
export function IssuePulls({
  issue,
}: {
  issue: { key: string; slug: string };
}) {
  const records = useRecords();
  const pulls = useMemo(
    () =>
      records
        ? allPullRequests(records).filter((p) => p.issue === issue.slug)
        : [],
    [records, issue.slug],
  );
  return (
    <>
      <dt>Pull requests</dt>
      <dd className="issue-pulls">
        {pulls.length === 0
          ? "None yet"
          : pulls.map((pull) => (
              <Link key={pull.number} href={pullHref(issue.key, pull.number)}>
                <PullIcon state={pull.state} size={14} />
                <span className="mono">#{pull.number}</span>{" "}
                <span className="dim">
                  {STATE_LABELS[pull.state]} · {checksText(pull)}
                </span>
              </Link>
            ))}
      </dd>
    </>
  );
}

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

function dateTime(at: string) {
  return new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One pull request: what led to it, what its checks said, and the code it changed. */
export function PullView({
  issue,
  number,
  revisionsJson,
  candidates,
}: {
  issue: PullIssue;
  candidates: IssueSummary[];
  number: number;
  /** Every published revision of the issue by id, as JSON: fixtures may hold a "__proto__" key. */
  revisionsJson: string;
}) {
  useEffect(
    () =>
      issue.revision
        ? setIssueContext({ id: issue.slug, revision: issue.revision })
        : undefined,
    [issue.slug, issue.revision],
  );
  // Legacy URLs remain read-only evidence; completion is written only by practice.
  const records = useRecords();
  const [tab, setTab] = useState<"timeline" | "checks" | "files">("timeline");
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const detail = useMemo(
    () =>
      records &&
      pullRequestDetail(records, issue.slug, number, (id) => revisions[id]),
    [records, issue.slug, number, revisions],
  );
  /** This pull request's attempt: a replay is read apart from the attempts before it. */
  const attempt = useMemo(
    () =>
      records && detail
        ? attemptRecords(records, issue.slug, detail.openedAt)
        : null,
    [records, detail, issue.slug],
  );
  const feedback = useMemo(
    () =>
      attempt
        ? feedbackOf(attempt, issue.slug, (id) => revisions[id])
        : { released: [], threads: [] },
    [attempt, issue.slug, revisions],
  );
  const merged = detail?.pull.state === "merged" ? detail.pull.mergedAt : null;
  const language = detail
    ? revisions[detail.pull.issueRevision]?.workspace.language
    : undefined;
  const resultInput = useMemo(
    () =>
      attempt && detail && merged && language
        ? {
            issue: {
              key: issue.key,
              slug: issue.slug,
              title: issue.title,
              revision: detail.pull.issueRevision,
            },
            language,
            records: attempt,
            mergedAt: merged,
            number,
            revisions,
          }
        : null,
    [
      attempt,
      detail,
      merged,
      language,
      issue.key,
      issue.slug,
      issue.title,
      revisions,
    ],
  );
  const result = useResult(resultInput);
  if (!records)
    return (
      <p className="loading-state" role="status">
        Reading saved submission…
      </p>
    );
  if (!detail)
    return (
      <p className="empty">
        There&apos;s no pull request #{number} for {issue.key} here. Pull
        requests open only where they were made: if someone sent you this link,
        ask them for their result link, or{" "}
        <Link href={tryHref(issue.key)}>try {issue.key} yourself</Link>.
      </p>
    );
  const pull = detail.pull;
  const revision = revisions[pull.issueRevision];
  // Each editable file against the revision's starting version of it.
  const changes: FileChange[] =
    revision && detail.code
      ? Object.entries(editableFiles(revision.workspace)).map(
          ([path, start]) => {
            const pushed = detail.code![path];
            const diff = diffLines(start.text, pushed?.text ?? "");
            return {
              path,
              diff,
              stats: diffStats(diff),
              truncated: !!pushed?.truncated,
            };
          },
        )
      : [];
  const stats = changes.reduce(
    (sum, c) => ({
      added: sum.added + c.stats.added,
      removed: sum.removed + c.stats.removed,
    }),
    { added: 0, removed: 0 },
  );
  const label = STATE_LABELS[pull.state];
  const threads = feedback.threads.filter((t) => t.number === number);
  return (
    <div className="pull">
      <article>
        <h1>
          {issue.title} <span className="faint">#{number}</span>
        </h1>
        <p className="pull-state">
          <span className={`pull-badge ${pull.state}`}>
            <PullIcon state={pull.state} size={14} /> {label}
          </span>
          <span className="dim">
            {pull.state === "merged"
              ? `Merged on ${dateTime(pull.mergedAt!)}`
              : `Opened on ${dateTime(detail.openedAt)}`}
            {pull.pushes > 1 &&
              ` · ${pull.pushes - 1} ${pull.pushes === 2 ? "push" : "pushes"} after opening`}{" "}
            ·{" "}
            <Link href={`/issues/${issue.key}`} className="mono">
              {issue.key}
            </Link>
          </span>
        </p>
        {pull.state === "merged" ? (
          <>
            <PullOutcome
              records={attempt}
              issue={issue}
              number={number}
              revisions={revisions}
              mergedAt={merged}
              blocker={undefined}
              ideHref={workHref(issue)}
            />
            <NextPractice
              candidates={candidates}
              current={issue.key}
              share={
                result &&
                resultInput && (
                  <ShareResult
                    state={result}
                    issue={resultInput.issue}
                    // Offered, never included by default: every file this pull request changed.
                    // A file kept only in part is passed as such, so sharing is refused, not partial.
                    code={changes
                      .filter((c) => c.stats.added + c.stats.removed > 0)
                      .map((c) => ({
                        path: c.path,
                        text: detail.code![c.path]?.text ?? "",
                        truncated: c.truncated,
                      }))}
                  />
                )
              }
            />
          </>
        ) : (
          <p className="practice-notice">
            This is a saved submission record. Continue in practice to submit
            current code and get feedback.{" "}
            <Link className="btn primary" href={workHref(issue)}>
              Continue practice
            </Link>
          </p>
        )}
        <Findings
          pull={pull}
          outcome={detail.outcome}
          cases={revision?.checks.cases}
          threads={threads}
          revisions={revisions}
        />
        <div
          className="pull-tabs"
          role="tablist"
          aria-label="Pull request details"
          onKeyDown={tabKeys}
        >
          <Tab id="timeline" tab={tab} setTab={setTab}>
            Timeline
          </Tab>
          <Tab id="checks" tab={tab} setTab={setTab}>
            Checks <span className="count">{checksText(pull)}</span>
          </Tab>
          <Tab id="files" tab={tab} setTab={setTab}>
            Files changed{" "}
            {detail.code && (
              <span className="count">
                <span className="add">+{stats.added}</span>{" "}
                <span className="del">−{stats.removed}</span>
              </span>
            )}
          </Tab>
        </div>
        <div
          role="tabpanel"
          id={`pull-panel-${tab}`}
          aria-labelledby={`pull-tab-${tab}`}
          tabIndex={0}
        >
          {tab === "timeline" && (
            <Timeline
              detail={detail}
              issue={issue}
              threads={threads}
              revisions={revisions}
            />
          )}
          {tab === "checks" && (
            <Checks outcome={detail.outcome} cases={revision?.checks.cases} />
          )}
          {tab === "files" && <Files saved={!!detail.code} changes={changes} />}
        </div>
        {pull.state === "merged" && (
          <Ask
            className="pull-ask"
            ids={["experience", "aiUse"]}
            from="result"
            why={{
              experience:
                "So a time like yours means something next to everyone else's.",
              aiUse:
                "So we can tell how unaided work changes with how much AI people use.",
            }}
          />
        )}
      </article>
      <aside className="props" aria-label="Details">
        <dl>
          <dt>Status</dt>
          <dd>{label}</dd>
          <dt>Issue</dt>
          <dd>
            <Link href={`/issues/${issue.key}`}>{issue.key}</Link>
          </dd>
          <dt>Language</dt>
          <dd>
            <LanguageTag language={revision?.workspace.language} />
          </dd>
          <dt>Checks</dt>
          <dd>{checksText(pull)}</dd>
          <dt>Elapsed</dt>
          <dd title="From first opening the issue to this pull request, breaks included">
            {duration(detail.stats.startedAt, detail.openedAt)}
          </dd>
          <dt>Test runs</dt>
          <dd>{detail.stats.runs}</dd>
          <dt>Edits</dt>
          <dd>{detail.stats.edits}</dd>
          {issue.revision && issue.revision !== pull.issueRevision && (
            <>
              <dt>Ticket</dt>
              <dd className="dim">Updated since</dd>
            </>
          )}
        </dl>
        {pull.state !== "merged" && <CopyIssueLink issueKey={issue.key} />}
      </aside>
    </div>
  );
}

function Tab<T extends string>({
  id,
  tab,
  setTab,
  children,
}: {
  id: T;
  tab: T;
  setTab: (tab: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      id={`pull-tab-${id}`}
      aria-controls={`pull-panel-${id}`}
      tabIndex={tab === id ? 0 : -1}
      aria-selected={tab === id}
      onClick={() => setTab(id)}
    >
      {children}
    </button>
  );
}

interface Review {
  threads: Thread[];
  revisions: Record<string, Revision>;
}

/** The timeline shows its newest entries; the rest wait behind See more. */
const TIMELINE_NEWEST = 6;

function Timeline({
  detail,
  issue,
  ...review
}: { detail: PullDetail; issue: PullIssue } & Review) {
  const { stats, previous } = detail;
  const [all, setAll] = useState(false);
  const hidden = Math.max(0, detail.timeline.length - TIMELINE_NEWEST);
  const shown = all ? detail.timeline : detail.timeline.slice(hidden);
  return (
    <div className="pull-timeline">
      <p className="pull-summary dim">
        {duration(stats.startedAt, detail.openedAt)} from{" "}
        {previous
          ? `pull request #${previous.number}`
          : "first opening the issue"}{" "}
        to this pull request
        {stats.firstGreenAt && (
          <>
            {" "}
            · tests first passed after{" "}
            {duration(stats.startedAt, stats.firstGreenAt)}
          </>
        )}
        .
      </p>
      {hidden > 0 && (
        <button
          type="button"
          className="pull-more"
          aria-expanded={all}
          aria-controls="pull-timeline-list"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "See less" : `See more (${hidden} earlier)`}
        </button>
      )}
      <ol id="pull-timeline-list">
        {(all || !hidden) && previous && (
          <TimelineRow at={previous.at} tone="dim">
            Follows{" "}
            <Link href={pullHref(issue.key, previous.number)}>
              #{previous.number}
            </Link>{" "}
            ({checksText(previous)})
          </TimelineRow>
        )}
        {shown.map((entry, index) => (
          <Entry key={index} entry={entry} issue={issue} {...review} />
        ))}
      </ol>
    </div>
  );
}

function TimelineRow({
  at,
  tone,
  children,
}: {
  at: string;
  tone: "dim" | "pass" | "fail" | "accent" | "merged" | "closed";
  children: React.ReactNode;
}) {
  return (
    <li className={tone}>
      <span className="dot" aria-hidden />
      <span className="text">{children}</span>
      <time dateTime={at}>{clock(at)}</time>
    </li>
  );
}

function Entry({
  entry,
  issue,
  threads,
  revisions,
}: { entry: TimelineEntry; issue: PullIssue } & Review) {
  switch (entry.kind) {
    case "review": {
      // The finding itself is under Findings; the timeline only says when it came.
      const thread = threads.find(
        (t) => t.comment === entry.comment && t.at === entry.at,
      );
      const comment =
        thread &&
        revisions[thread.issueRevision]?.team.find(
          (c) => c.id === thread.comment,
        );
      if (!thread || !comment) return null;
      return (
        <TimelineRow
          at={entry.at}
          tone={thread.severity === "blocking" ? "fail" : "dim"}
        >
          {comment.author.name} reviewed push {thread.push}:{" "}
          {thread.severity === "blocking"
            ? "requested changes"
            : thread.severity === "nit"
              ? "left a nit"
              : "commented"}
          .
        </TimelineRow>
      );
    }
    case "resolved": {
      const author = revisions[entry.issueRevision]?.team.find(
        (c) => c.id === entry.comment,
      )?.author.name;
      return (
        <TimelineRow at={entry.at} tone="pass">
          {author ? `${author}'s review comment` : "A review comment"} was
          resolved by push {entry.push}.
        </TimelineRow>
      );
    }
    case "note": {
      const from = revisions[entry.issueRevision];
      const note =
        entry.source === "hint"
          ? from?.hints.find((h) => h.id === entry.id)
          : from?.team.find((c) => c.id === entry.id);
      if (!note) return null;
      const text =
        "level" in note
          ? note.text
          : (note.text[entry.wording] ?? note.text[0]);
      return (
        <TimelineRow at={entry.at} tone="dim">
          {note.author.name} commented on {issue.key}:
          <span className="pull-note">
            <Markdown source={text} />
          </span>
        </TimelineRow>
      );
    }
    case "opened":
      return (
        <TimelineRow at={entry.at} tone="dim">
          Opened {issue.key} in the IDE
          {entry.times > 1 && ` (${entry.times} times)`}
        </TimelineRow>
      );
    case "edits":
      return (
        <TimelineRow at={entry.at} tone="dim">
          Edited the code: {entry.count}{" "}
          {entry.count === 1 ? "change" : "changes"}
          {entry.from !== entry.at && (
            <> over {duration(entry.from, entry.at)}</>
          )}
        </TimelineRow>
      );
    case "run":
      return (
        <TimelineRow
          at={entry.at}
          tone={entry.tested && entry.passed === entry.total ? "pass" : "fail"}
        >
          Ran the tests:{" "}
          {entry.tested
            ? `${entry.passed}/${entry.total} passing`
            : (RUN_STATUS[entry.status] ?? "didn't reach the tests")}
        </TimelineRow>
      );
    case "pull-request":
      return (
        <TimelineRow at={entry.at} tone="accent">
          Opened pull request #{entry.number}
        </TimelineRow>
      );
    case "push":
      return (
        <TimelineRow at={entry.at} tone="accent">
          Pushed new code to #{entry.number}
        </TimelineRow>
      );
    case "checks":
      return (
        <TimelineRow
          at={entry.at}
          tone={passed(entry.result) ? "pass" : "fail"}
        >
          {passed(entry.result)
            ? `CI: all ${entry.total} checks passed.`
            : entry.result === "checks-failed"
              ? `CI: ${entry.passed}/${entry.total} checks passed.`
              : entry.result === "checks-errored"
                ? "CI: the checks errored before reaching the tests."
                : "CI: the checks were cancelled."}
        </TimelineRow>
      );
    case "merged":
      return (
        <TimelineRow at={entry.at} tone="merged">
          Merged. {issue.key} moved to Done.
        </TimelineRow>
      );
    case "closed":
      return (
        <TimelineRow at={entry.at} tone="closed">
          Closed without merging.
        </TimelineRow>
      );
  }
}

const RUN_STATUS: Record<string, string> = {
  "user-error": "the code raised an error",
  timeout: "timed out",
  "runner-error": "the test runner crashed",
  cancelled: "cancelled",
};

interface FileChange {
  path: string;
  diff: ReturnType<typeof diffLines>;
  stats: { added: number; removed: number };
  truncated: boolean;
}

/** Every editable file's diff from the starting code; unchanged files fold to one line. */
function Files({ saved, changes }: { saved: boolean; changes: FileChange[] }) {
  if (!saved || !changes.length)
    return (
      <p className="dim">
        The code for this pull request isn&apos;t available.
      </p>
    );
  const changed = changes.filter((c) => c.stats.added || c.stats.removed);
  const same = changes.filter((c) => !c.stats.added && !c.stats.removed);
  return (
    <div className="pull-files">
      {changed.map(({ path, diff, stats, truncated }) => (
        <div className="diff" key={path}>
          <div className="diff-head">
            <span className="mono">{path}</span>
            <span>
              <span className="add">+{stats.added}</span>{" "}
              <span className="del">−{stats.removed}</span>
            </span>
          </div>
          <table>
            <tbody>
              {hunks(diff).map((hunk, h) => (
                <HunkRows key={h} hunk={hunk} />
              ))}
            </tbody>
          </table>
          {truncated && (
            <p className="dim diff-empty">
              This file is too long to show in full.
            </p>
          )}
        </div>
      ))}
      {same.length > 0 && (
        <p className="dim">
          {changed.length
            ? "Unchanged: "
            : "No changes from the starter code in "}
          {same.map((c, i) => (
            <span key={c.path}>
              {i > 0 && ", "}
              <span className="mono">{c.path}</span>
            </span>
          ))}
          .
        </p>
      )}
    </div>
  );
}

function HunkRows({ hunk }: { hunk: ReturnType<typeof hunks>[number] }) {
  return (
    <>
      <tr className="hunk">
        <td colSpan={3}>
          @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines}{" "}
          @@
        </td>
      </tr>
      {hunk.lines.map((line, i) => (
        <tr key={i} className={line.kind}>
          <td className="ln">{line.oldLine ?? ""}</td>
          <td className="ln">{line.newLine ?? ""}</td>
          <td className="code">
            <span className="sign" aria-hidden>
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
            </span>
            {line.text}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * What stands between this pull request and merging, and only that: failing CI checks, which
 * only a push that passes can clear, and review findings (the latest thread of each blocking
 * comment or nit), each resolvable by a push that fixes it, a reply or Resolve. Resolving never
 * touches CI, and a finding the code still triggers opens again on the next push.
 */
/**
 * Review, then merge: only a pull request whose checks all passed and whose blocking review
 * comments are resolved can be merged, as with branch protection. Merging moves the issue to
 * Done.
 */
function NextPractice({
  candidates,
  current,
  share,
}: {
  candidates: IssueSummary[];
  current: string;
  share?: React.ReactNode;
}) {
  const { items } = useBoard();
  const account = useAccount();
  const from = candidates.find((i) => i.key === current);
  const next = from
    ? nextProblem(from, candidates, items, account?.profile.languages ?? [])
    : null;
  return (
    <section className="practice-next" aria-label="Continue practicing">
      {next ? (
        <>
          <h2>Next: {next.title}</h2>
          <div className="practice-actions">
            <StartWork issue={next} href={`/work/${next.key}`} />
            {share}
            <CopyIssueLink issueKey={current} />
          </div>
        </>
      ) : (
        <div className="practice-actions">
          <Link className="btn start" href="/issues">
            Browse issues →
          </Link>
          {share}
          <CopyIssueLink issueKey={current} />
        </div>
      )}
      <p className="dim">
        <Link href="/dashboard">Back to your desk</Link>
        {next && (
          <>
            {" "}
            · <Link href="/issues">Browse issues</Link>
          </>
        )}
      </p>
    </section>
  );
}
