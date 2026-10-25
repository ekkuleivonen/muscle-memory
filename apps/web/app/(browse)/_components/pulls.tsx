"use client";
import { tabKeys } from "../../../lib/tab-keys";
import { suggestions } from "../../../lib/board";
import { useAccount } from "./profile-menu";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  editableFiles,
  type Case,
  type Revision,
} from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import { runFeedback } from "../../../../../packages/domain/workspace";
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
import type { BoardMoveVia } from "../../../../../packages/domain/board";
import { LanguageTag } from "./bits";
import { StartWork, useBoard } from "./board";
import { logReply, logResult, setIssueContext } from "./board-log";
import { metricsOf } from "../../../lib/result";
import { Markdown } from "./markdown";
import { Ask } from "./ask";
import { ResultFacts, ShareResult, useResult } from "./result-card";
import { useNow, useRecords } from "./records";
import { feedbackOf, openBlocking, type Thread } from "../../../lib/feedback";

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
      {state === "merged" ? (
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
  /** Bumped after a reply is recorded, so the records are read again. */
  const [version, setVersion] = useState(0);
  const records = useRecords(version);
  const board = useBoard();
  const [tab, setTab] = useState<"timeline" | "checks" | "files">("timeline");
  /** Set when merged on this page, before the stored records are read again. */
  const [mergedNow, setMergedNow] = useState<string | null>(null);
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
  const feedback = useMemo(
    () =>
      records ? feedbackOf(records, issue.slug) : { released: [], threads: [] },
    [records, issue.slug],
  );
  const merged =
    mergedNow ??
    (detail?.pull.state === "merged" ? detail.pull.mergedAt : null);
  const language = detail
    ? revisions[detail.pull.issueRevision]?.workspace.language
    : undefined;
  const resultInput = useMemo(
    () =>
      records && detail && merged && language
        ? {
            issue: {
              key: issue.key,
              slug: issue.slug,
              title: issue.title,
              revision: detail.pull.issueRevision,
            },
            language,
            records,
            mergedAt: merged,
            revisions,
          }
        : null,
    [
      records,
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
        Reading this pull request…
      </p>
    );
  if (!detail)
    return (
      <p className="empty">
        There&apos;s no pull request #{number} for {issue.key}.
      </p>
    );
  const pull: PullSummary = mergedNow
    ? { ...detail.pull, state: "merged", mergedAt: mergedNow }
    : detail.pull;
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
  const blocking = openBlocking(feedback, number);
  const reply = async (thread: Thread, text: string) => {
    await logReply(
      { id: issue.slug, revision: thread.issueRevision },
      {
        issueKey: issue.key,
        pullRequest: number,
        comment: thread.comment,
        text,
      },
    );
    setVersion((v) => v + 1);
  };
  const merge = (via: BoardMoveVia) => {
    // The result card's numbers as they stand at the merge: what the aggregates are made of.
    if (revision)
      void logResult(
        { id: issue.slug, revision: pull.issueRevision },
        {
          issueKey: issue.key,
          pullRequest: pull.number,
          language: revision.workspace.language,
          metrics: 2,
          values: metricsOf(
            records,
            issue.slug,
            new Date().toISOString(),
            (id) => revisions[id],
          ) as unknown as Json,
        },
      );
    board.complete(
      {
        key: issue.key,
        slug: issue.slug,
        revision: issue.revision ?? pull.issueRevision,
      },
      { number: pull.number, runId: pull.runId },
      via,
    );
    setMergedNow(new Date().toISOString());
  };
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
        {pull.state === "merged" && (
          <NextPractice candidates={candidates} current={issue.key} />
        )}
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
              detail={
                mergedNow
                  ? {
                      ...detail,
                      timeline: [
                        ...detail.timeline,
                        { kind: "merged", at: mergedNow },
                      ],
                    }
                  : detail
              }
              issue={issue}
              threads={threads}
              revisions={revisions}
              onReply={pull.state === "merged" ? undefined : reply}
            />
          )}
          {tab === "checks" && (
            <Checks outcome={detail.outcome} cases={revision?.checks.cases} />
          )}
          {tab === "files" && <Files saved={!!detail.code} changes={changes} />}
        </div>
        <MergeBox
          pull={pull}
          issue={issue}
          blocking={blocking.length}
          onMerge={merge}
          share={
            result &&
            resultInput && (
              <ShareResult state={result} issue={resultInput.issue} />
            )
          }
        />
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
          {result ? (
            <ResultFacts state={result} />
          ) : (
            <>
              <dt>Test runs</dt>
              <dd>{detail.stats.runs}</dd>
            </>
          )}
          <dt>Edits</dt>
          <dd>{detail.stats.edits}</dd>
          {issue.revision && issue.revision !== pull.issueRevision && (
            <>
              <dt>Ticket</dt>
              <dd className="dim">Updated since</dd>
            </>
          )}
        </dl>
        {pull.state !== "merged" && !pull.otherMerged && (
          <Link
            className="pull-continue"
            href={workHref(issue)}
            title={`Back to the IDE to keep working; push to #${number} from there (⌘⇧⏎)`}
          >
            Continue in the IDE →
          </Link>
        )}
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
  /** Absent once merged: the conversation is closed. */
  onReply?: (thread: Thread, text: string) => Promise<void>;
}

function Timeline({
  detail,
  issue,
  ...review
}: { detail: PullDetail; issue: PullIssue } & Review) {
  const { stats, previous } = detail;
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
      <ol>
        {previous && (
          <TimelineRow at={previous.at} tone="dim">
            Follows{" "}
            <Link href={pullHref(issue.key, previous.number)}>
              #{previous.number}
            </Link>{" "}
            ({checksText(previous)})
          </TimelineRow>
        )}
        {detail.timeline.map((entry, index) => (
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
  tone: "dim" | "pass" | "fail" | "accent" | "merged";
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
  onReply,
}: { entry: TimelineEntry; issue: PullIssue } & Review) {
  switch (entry.kind) {
    case "review": {
      const thread = threads.find(
        (t) => t.comment === entry.comment && t.at === entry.at,
      );
      return thread ? (
        <ReviewThread
          thread={thread}
          revision={revisions[thread.issueRevision]}
          onReply={onReply}
        />
      ) : null;
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
  }
}

const RUN_STATUS: Record<string, string> = {
  "user-error": "the code raised an error",
  timeout: "timed out",
  "runner-error": "the test runner crashed",
  cancelled: "cancelled",
};

interface Outcome {
  status: string;
  phase?: string;
  error?: { type: string; message: string; traceback?: { text: string } };
  cases?: {
    output?: { text: string; truncated: boolean };
    error?: { type: string; message: string };
    unserializable?: string;
  }[];
  stdout?: { text: string };
  durationMs?: number;
  timeoutMs?: number;
  message?: string;
}

const show = (value: unknown) => JSON.stringify(value);

function Checks({
  outcome: raw,
  cases,
}: {
  outcome: Json | null;
  cases?: readonly Case[];
}) {
  const outcome = raw as unknown as Outcome | null;
  if (!outcome || !cases)
    return (
      <p className="dim">
        No CI results for this pull request.
      </p>
    );
  if (outcome.status === "timeout")
    return (
      <p className="pull-error">
        The checks timed out after {Math.round((outcome.timeoutMs ?? 0) / 1000)}{" "}
        s, before every case finished.
      </p>
    );
  if (outcome.status === "runner-error")
    return (
      <p className="pull-error">
        CI crashed before the checks finished; this wasn&apos;t your code.
        Push again to rerun them.
      </p>
    );
  if (outcome.status === "cancelled")
    return <p className="dim">The checks were cancelled.</p>;
  const verdicts =
    outcome.phase === "tests" && outcome.cases
      ? runFeedback(cases, outcome.cases).passed
      : null;
  return (
    <div className="pull-checks">
      {outcome.error && (
        <div className="pull-error">
          <b>
            {outcome.error.type}: {outcome.error.message}
          </b>
          {outcome.error.traceback?.text && (
            <pre>{outcome.error.traceback.text}</pre>
          )}
        </div>
      )}
      {verdicts && (
        <ol>
          {cases.map(({ input, expected }, index) => {
            const got = outcome.cases?.[index];
            const ok = verdicts[index];
            return (
              <li key={index} className={ok ? "pass" : "fail"}>
                <span className="mark" aria-label={ok ? "Passed" : "Failed"}>
                  {ok ? "✔" : "✘"}
                </span>
                <div>
                  <code>{show(input)}</code> <span className="dim">→</span>{" "}
                  <code>{show(expected)}</code>
                  {!ok && (
                    <div className="got">
                      {got?.error ? (
                        <>
                          raised{" "}
                          <code>
                            {got.error.type}: {got.error.message}
                          </code>
                        </>
                      ) : got?.output ? (
                        <>
                          returned <code>{got.output.text}</code>
                          {got.output.truncated && " (truncated)"}
                        </>
                      ) : (
                        <>returned a value that isn&apos;t JSON</>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {outcome.stdout?.text && (
        <details className="pull-output">
          <summary>Printed output</summary>
          <pre>{outcome.stdout.text}</pre>
        </details>
      )}
      {typeof outcome.durationMs === "number" && (
        <p className="dim pull-duration">
          Ran in {Math.round(outcome.durationMs)} ms.
        </p>
      )}
    </div>
  );
}

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

/** A teammate's review comment, its replies and whether it is resolved. */
function ReviewThread({
  thread,
  revision,
  onReply,
}: {
  thread: Thread;
  revision: Revision | undefined;
  onReply?: (thread: Thread, text: string) => Promise<void>;
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
          {blocking ? (
            <span
              className={`review-badge ${thread.resolved ? "resolved" : "blocking"}`}
            >
              {thread.resolved ? "Resolved" : "Requested changes"}
            </span>
          ) : thread.severity === "nit" ? (
            <span className="review-badge">Nit</span>
          ) : null}
          <time dateTime={thread.at}>{clock(thread.at)}</time>
        </header>
        <Markdown source={comment.text[thread.wording] ?? comment.text[0]} />
        <p className="faint review-on">On push {thread.push}</p>
        {thread.replies.map((r, i) => (
          <div className="review-reply" key={i}>
            <b>You</b> <time dateTime={r.at}>{clock(r.at)}</time>
            <p>{r.text}</p>
          </div>
        ))}
        {thread.resolved && (
          <p className="faint">
            {thread.resolved.by === "code"
              ? `Resolved by push ${thread.resolved.push}: it no longer applies.`
              : "Resolved by your reply."}
          </p>
        )}
        {onReply && (
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
 * Review, then merge: only a pull request whose checks all passed and whose blocking review
 * comments are resolved can be merged, as with branch protection. Merging moves the issue to
 * Done.
 */
function MergeBox({
  pull,
  issue,
  blocking,
  onMerge,
  share,
}: {
  pull: PullSummary;
  issue: PullIssue;
  /** Open blocking review threads. */
  blocking: number;
  onMerge: (via: BoardMoveVia) => void;
  /** Shown once merged: sharing the result. */
  share?: React.ReactNode;
}) {
  if (pull.state === "merged")
    return (
      <div className="merge-box merged">
        <PullIcon state="merged" size={18} />
        <div className="merge-text">
          <b>Merged.</b> {issue.key} is Done.
        </div>
        {share}
      </div>
    );
  if (pull.otherMerged)
    return (
      <div className="merge-box blocked">
        <span className="merge-mark" aria-hidden>
          –
        </span>
        <div className="merge-text">
          <b>{issue.key} is already Done.</b> Pull request{" "}
          <Link href={pullHref(issue.key, pull.otherMerged)}>
            #{pull.otherMerged}
          </Link>{" "}
          was merged, so there is nothing left to merge this into.
        </div>
      </div>
    );
  const checks = passed(pull.result);
  const green = checks && blocking === 0;
  return (
    <div className={green ? "merge-box ready" : "merge-box blocked"}>
      <span className="merge-mark" aria-hidden>
        {green ? "✔" : "✘"}
      </span>
      <div className="merge-text">
        {checks && !green ? (
          <>
            <b>
              All {pull.total} checks passed, but {blocking} blocking review
              comment{blocking === 1 ? " is" : "s are"} open.
            </b>{" "}
            Change the code in the <Link href={workHref(issue)}>IDE</Link> and
            push to it (<kbd>⌘⇧⏎</kbd>), or reply to explain why it should stay
            as it is.
          </>
        ) : green ? (
          <>
            <b>All {pull.total} checks passed.</b> Read through your changes,
            then merge when you&apos;re happy with them. Merging moves{" "}
            {issue.key} to Done.
          </>
        ) : (
          <>
            <b>Merging is blocked: {checksText(pull)}.</b> Every check has to
            pass. The pull request stays open: keep working in the{" "}
            <Link href={workHref(issue)}>IDE</Link> and push to it (
            <kbd>⌘⇧⏎</kbd>), and CI runs again.
          </>
        )}
      </div>
      <button
        type="button"
        className="merge-button"
        disabled={!green}
        // A click from the keyboard (Enter or Space) has no pointer position.
        onClick={(event) =>
          onMerge(event.detail === 0 ? "keyboard" : "pointer")
        }
      >
        Merge pull request
      </button>
    </div>
  );
}

function NextPractice({
  candidates,
  current,
}: {
  candidates: IssueSummary[];
  current: string;
}) {
  const { items } = useBoard();
  const account = useAccount();
  const next = suggestions(
    candidates.filter((i) => i.key !== current),
    items,
    account?.profile.languages ?? [],
  )[0];
  return (
    <section className="practice-next">
      <h2>Fix merged. Nice work.</h2>
      <p>Your code passed CI and this issue is now Done on your board.</p>
      {next && (
        <>
          <p>
            Try next: {next.title} · {next.difficulty}.
          </p>
          <StartWork issue={next} href={`/work/${next.key}`} />
        </>
      )}
      <p>
        <Link href="/dashboard">Back to your desk →</Link> ·{" "}
        <Link href="/issues">Browse issues</Link>
      </p>
    </section>
  );
}
