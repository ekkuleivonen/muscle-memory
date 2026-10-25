"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import { readProfile } from "../../../lib/account";
import { attemptRecords } from "../../../lib/attempts";
import { attemptAt } from "../../../lib/attempts";
import { chatOf } from "../../../lib/chat";
import {
  attemptLabel,
  incidentState,
  incidentTimeline,
  shortVersion,
  sinceStart,
} from "../../../lib/incident";
import {
  duration,
  encodeResult,
  incidentSentence,
  incidentTime,
  metricsOf,
  type Result,
} from "../../../lib/result";
import { logShare } from "../../(browse)/_components/board-log";
import { pullHref } from "../../(browse)/_components/pulls";
import { TeamChat } from "../../(browse)/_components/team-chat";
import { useRecords } from "../../(browse)/_components/records";
import { copyText, receiptLines } from "../../(browse)/_components/result-card";

type Channel = "copy" | "x" | "linkedin" | "native";

/**
 * The report for the latest attempt, once it has earned one: its own merged pull request,
 * whose merged push passed every check (merging resolves it). Everything on it comes from this
 * browser's records of that attempt; the story lines are the fictional company's.
 */
export function IncidentReport({
  issue,
  revisionsJson,
}: {
  issue: { key: string; slug: string };
  revisionsJson: string;
}) {
  const records = useRecords();
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const [code, setCode] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  useEffect(() => {
    setHandle(readProfile()?.handle ?? null);
    openPracticeStore()
      .then(async (store) => {
        try {
          setCode(await store.referralCode());
        } finally {
          store.close();
        }
      })
      .catch(() => undefined);
  }, []);
  const state = useMemo(() => records && incidentState(records), [records]);
  const report = useMemo(() => {
    if (!records || !state?.merged) return null;
    const attempt = attemptRecords(records, issue.slug);
    const revisionFor = (id: string) => revisions[id];
    // What the team said in the chat during this attempt, in the order it was said.
    const chat = chatOf(
      revisions[state.merged.revision]?.chat ?? [],
      records,
      issue.slug,
      revisionFor,
    );
    const timeline = incidentTimeline(records, revisionFor);
    return {
      // The numbers as at the merge, the same definitions as the merged pull request's.
      metrics: metricsOf(attempt, issue.slug, state.merged.at, revisionFor),
      timeline,
      chat,
      // Wall clock from the attempt's first recorded moment (the page acknowledged) to the merge.
      elapsed: Math.max(
        0,
        Math.round(
          (Date.parse(state.merged.at) -
            Date.parse(timeline[0]?.at ?? state.merged.at)) /
            1000,
        ),
      ),
    };
  }, [records, state, issue.slug, revisions]);

  if (!records || !state)
    return (
      <p className="loading-state" role="status">
        Reading your records…
      </p>
    );
  if (!report || !state.merged)
    return (
      <section className="home-hero incident-unfiled">
        <p className="home-kicker">Incident report · {issue.key}</p>
        <h1>Nothing to file yet.</h1>
        <p className="home-lede">
          {!state.started
            ? "There's no response to this incident yet."
            : `Your ${attemptLabel(state.attempt.number).toLowerCase()} hasn't merged a fix whose checks all pass.`}{" "}
          A report is filed once a fix whose checks all pass is merged, in the
          same response.
        </p>
        <div className="home-actions">
          <Link className="home-cta" href="/incident">
            {state.started ? "Back to the incident →" : "Take the incident →"}
          </Link>
        </div>
      </section>
    );

  const { metrics, timeline, chat, elapsed } = report;
  const version = shortVersion(state.merged.revision);
  const result: Result | null = code
    ? {
        v: 2,
        k: issue.key,
        l: "javascript",
        c: code,
        ...metrics,
        iv: version,
        a: state.attempt.number,
        e: elapsed,
      }
    : null;
  const start = timeline[0]?.at ?? state.merged.at;
  return (
    <>
      <article className="incident-report" aria-label="Incident report">
        <header className="incident-report-head">
          <span>INCIDENT REPORT</span>
          <span className="mono">
            {issue.key} · version {version}
          </span>
        </header>
        <h1>Checkout restored.</h1>
        <p className="incident-report-sub">
          Kettlebrook · checkout-api · SEV-1 · <b>Resolved</b>
        </p>
        <dl className="incident-facts">
          <dt>On call</dt>
          <dd>{handle ?? "you"}</dd>
          <dt>Response</dt>
          <dd>{attemptLabel(state.attempt.number)}</dd>
          <dt>Fix</dt>
          <dd>
            <Link href={pullHref(issue.key, state.merged.number)}>
              Pull request #{state.merged.number}
            </Link>
            : {state.merged.passed} of {state.merged.total} checks passed,
            merged
          </dd>
          <dt>Time to restore</dt>
          <dd>
            {`${duration(elapsed)} wall clock, from the first step (${timeline[0]?.label ?? "none"}) to the merge; ${duration(metrics.t)} of it active work`}
          </dd>
          <dt>AI tools</dt>
          <dd>
            None in this simulation: down in the story, and this IDE has no
            completion, chat or generated code.
          </dd>
        </dl>

        <h2>Timeline</h2>
        <p className="faint">What you did in this response, in order.</p>
        <ol className="incident-timeline">
          {timeline.map((m) => (
            <li key={m.label}>
              <span className="mono">{sinceStart(start, m.at)}</span> {m.label}
            </li>
          ))}
        </ol>

        <h2>What happened</h2>
        <p>
          A members-only free-shipping change (CHK-412) shipped on Thursday. It
          read a loyalty tier from every customer, and guests don&apos;t have
          one, so their quotes threw and checkout answered with 500s. Few guests
          shop by day; the 02:00 newsletter brought enough of them to page. The
          regression test for order #88213 now guards it.
        </p>

        <h2>The numbers</h2>
        <dl className="receipt-rows">
          {receiptLines(metrics).map(([label, value, good]) => (
            <div key={label} className="receipt-row">
              <dt>{label}</dt>
              <span aria-hidden className="receipt-dots" />
              <dd className={good ? "good" : undefined}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="faint">
          Raw facts from your work. No score, no rank, not a hiring signal.
        </p>

        {chat.length > 0 && (
          <>
            <h2>Overheard in #incident</h2>
            <p className="faint">The team chat while you worked, in order.</p>
            <ul className="incident-overheard">
              {chat.map((line, index) => (
                <li key={index}>
                  <b>{line.author}</b>{" "}
                  <span className="faint">{line.role}</span>{" "}
                  {line.text.replace(/`/g, "")}
                </li>
              ))}
            </ul>
          </>
        )}

        <h2>Status page</h2>
        <ul className="incident-status">
          <li>
            <span className="mono">02:14</span> <b>Investigating.</b> Checkout
            is failing for some customers. We&apos;re on it. (Typed by hand, the
            status bot being down.)
          </li>
          <li>
            <span className="mono">+{duration(elapsed)}</span> <b>Resolved.</b>{" "}
            Checkout is back. Guests are paying for shipping again, and for once
            they&apos;re pleased about it.
          </li>
        </ul>

        <h2>Follow-ups</h2>
        <ul className="incident-followups">
          <li>
            Tomasz to make a guest account, and to use it. (He has made one.
            It&apos;s a member.)
          </li>
          <li>Runbook step 3 to point somewhere other than step 1.</li>
          <li>
            Bea to reply to the customer who wrote MY MUGS. She has drafted it
            herself.
          </li>
        </ul>
      </article>
      {result && (
        <IncidentShare
          result={result}
          issue={{ id: issue.slug, revision: state.merged.revision }}
        />
      )}
      <p className="incident-after">
        <Link href="/incident">Replay the incident</Link> ·{" "}
        <Link href="/dashboard">Back to your desk</Link>
      </p>
      <TeamChat
        messages={chat}
        scope={`${issue.slug}@${attemptAt(records, issue.slug).start ?? "first"}`}
      />
    </>
  );
}

/** Invite friends to the same incident, at the same version: the card's link says which. */
function IncidentShare({
  result,
  issue,
}: {
  result: Result;
  issue: { id: string; revision: string };
}) {
  const [copied, setCopied] = useState(false);
  const segment = encodeResult(result);
  const url = `${location.origin}/r/${segment}`;
  const text = `${incidentSentence(result)} Same incident, your turn:`;
  const share = async (channel: Channel) => {
    void logShare(issue, {
      issueKey: result.k,
      channel,
      ref: result.c,
      card: result as unknown as Json,
    });
    if (channel === "copy") setCopied(await copyText(`${text} ${url}`));
    else if (channel === "x")
      window.open(
        `https://x.com/intent/post?${new URLSearchParams({ text, url })}`,
        "_blank",
        "noopener",
      );
    else if (channel === "linkedin")
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`,
        "_blank",
        "noopener",
      );
    else await navigator.share?.({ text, url }).catch(() => undefined);
  };
  return (
    <section className="incident-share">
      <h2>Page a friend</h2>
      <p>
        Same broken checkout, same log, same failing order #88213: version{" "}
        {result.iv}, whatever changes here later. Your numbers to beat:{" "}
        <b>{incidentTime(result)}</b>, {result.r} test{" "}
        {result.r === 1 ? "run" : "runs"}. The link carries your numbers, never
        your code.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- the generated preview, as posted */}
      <img
        className="share-preview"
        src={`/r/${segment}/opengraph-image`}
        alt={text}
        width={1200}
        height={630}
      />
      <p className="share-text">{text}</p>
      <div className="share-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void share("copy")}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button type="button" onClick={() => void share("x")}>
          Post on X
        </button>
        <button type="button" onClick={() => void share("linkedin")}>
          LinkedIn
        </button>
        {"share" in navigator && (
          <button type="button" onClick={() => void share("native")}>
            Share…
          </button>
        )}
      </div>
    </section>
  );
}
