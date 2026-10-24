"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { answerQuestions, readProfile } from "../../../lib/account";
import { LANGUAGES } from "../../../lib/languages";
import type { Profile } from "../../../lib/onboarding";
import { INGEST_URL } from "../../../lib/ingest";
import {
  compare,
  comparisonLine,
  duration,
  encodeResult,
  metricsOf,
  sentence,
  type Aggregate,
  type Metrics,
  type Result,
} from "../../../lib/result";
import { logProfile, logShare } from "./board-log";

type Channel = "copy" | "x" | "linkedin" | "native";

/** The receipt's lines, shared by the card here and the shared page. */
export function receiptLines(m: Metrics): [string, string, boolean?][] {
  return [
    ["active time", duration(m.t)],
    ["read before typing", duration(m.rd)],
    ["keystrokes", String(m.ks)],
    ["typos fixed (est.)", String(m.ty)],
    ["peak speed", m.w ? `${m.w} wpm` : "–"],
    [
      "test runs",
      m.g === 1 ? `${m.r} · green first try` : m.g ? `${m.r} · green on run ${m.g}` : String(m.r),
      m.g === 1,
    ],
    ["hints", m.h ? String(m.h) : "none"],
    ["pastes", String(m.ps)],
    ["left the tab", m.lt ? `${m.lt}×` : "never"],
  ];
}

export function Receipt({
  headline,
  detail,
  metrics,
  top,
  comparison,
  children,
}: {
  headline: string;
  detail: string;
  metrics: Metrics;
  top: string;
  /** "Faster than 72% of people who fixed it in Python." */
  comparison?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="receipt">
      <div className="receipt-top">
        <span>{top}</span>
        <span className="receipt-merged">✔ merged</span>
      </div>
      <p className="receipt-head">{headline}</p>
      <p className="receipt-sub">{detail}</p>
      {comparison && <p className="receipt-compare">{comparison}</p>}
      <dl className="receipt-rows">
        {receiptLines(metrics).map(([label, value, good]) => (
          <div key={label} className="receipt-row">
            <dt>{label}</dt>
            <span aria-hidden className="receipt-dots" />
            <dd className={good ? "good" : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

/**
 * What a merged pull request adds up to, from the person's own recorded keystrokes and runs,
 * and a way to share it. The fix itself is never shown, so a friend still gets a fair go.
 */
export function ResultCard({
  issue,
  language,
  records,
  mergedAt,
  pullRequest,
  revisions,
}: {
  issue: { key: string; slug: string; title: string; revision: string };
  language: string;
  records: readonly WorkspaceRecord[];
  mergedAt: string;
  pullRequest: number;
  revisions: Record<string, Revision>;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aggregate, setAggregate] = useState<Aggregate | undefined>();
  useEffect(() => {
    // Stealth players are left out of the aggregates and see no comparisons.
    if (!INGEST_URL || readProfile()?.stealth) return;
    let live = true;
    fetch(`${INGEST_URL}/v1/aggregates`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && setAggregate(body?.issues?.[issue.key]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [issue.key]);
  useEffect(() => {
    let live = true;
    openPracticeStore()
      .then(async (store) => {
        try {
          const referral = await store.referralCode();
          if (live) setCode(referral);
        } finally {
          store.close();
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const metrics = useMemo(
    () => metricsOf(records, issue.slug, mergedAt, (id) => revisions[id]),
    [records, issue.slug, mergedAt, revisions],
  );
  if (!code) return null;
  const label = LANGUAGES.find((l) => l.id === language)?.label ?? language;
  const { fasterThan, people } = compare(aggregate, metrics.t);
  const result: Result = {
    v: 2,
    k: issue.key,
    l: language,
    c: code,
    ...metrics,
    ...(aggregate ? { fn: people, ...(fasterThan !== undefined ? { fp: fasterThan } : {}) } : {}),
  };
  const url = `${location.origin}/r/${encodeResult(result)}`;
  const text = `${sentence(result, label)} Can you still code without it?`;
  const share = async (channel: Channel) => {
    void logShare(
      { id: issue.slug, revision: issue.revision },
      { issueKey: issue.key, channel, ref: code, card: result as unknown as Json },
    );
    if (channel === "copy") {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } else if (channel === "x")
      window.open(`https://x.com/intent/post?${new URLSearchParams({ text, url })}`, "_blank", "noopener");
    else if (channel === "linkedin")
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`,
        "_blank",
        "noopener",
      );
    else await navigator.share?.({ text, url }).catch(() => undefined);
  };
  return (
    <section className="result-card" aria-label="Your result">
      <Receipt
        top={`muscle memory · pull request #${pullRequest}`}
        headline="I fixed a real bug without AI."
        detail={`“${issue.title}”, in ${label}, from memory, with no autocomplete.`}
        metrics={metrics}
        comparison={comparisonLine(result, label)}
      >
        <div className="receipt-foot">
          <span className="receipt-ask">Can your friends still do it?</span>
          <span className="receipt-share">
            <button type="button" className="primary" onClick={() => void share("copy")}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => void share("x")}>
              Post on X
            </button>
            <button type="button" onClick={() => void share("linkedin")}>
              LinkedIn
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" onClick={() => void share("native")}>
                Share…
              </button>
            )}
          </span>
        </div>
      </Receipt>
      <QuickQuestions />
      <p className="result-next">
        Every number comes from your own keystrokes and runs; typos are estimated from quick
        backspaces. <Link href="/dashboard">Look around your desk →</Link>
      </p>
    </section>
  );
}

const EXPERIENCE: [NonNullable<Profile["experience"]>, string][] = [
  ["new", "Under a year"],
  ["some", "1–3 years"],
  ["professional", "3–10 years"],
  ["veteran", "10+ years"],
];
const AI_USE: [NonNullable<Profile["aiUse"]>, string][] = [
  ["daily", "Every day"],
  ["weekly", "Most weeks"],
  ["rarely", "Now and then"],
  ["never", "Never"],
];

/** Two of the setup questions, one tap each, while they are unanswered. Optional. */
function QuickQuestions() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => setProfile(readProfile()?.profile ?? null), []);
  if (!profile || (profile.experience && profile.aiUse)) return null;
  const answer = (answers: Partial<Profile>) => {
    const next = answerQuestions(answers);
    if (!next) return;
    setProfile(next);
    void logProfile({ from: "result", answers: { ...next } as Json });
  };
  return (
    <div className="quick-questions">
      <p>Two quick questions, so numbers like these mean something. Optional.</p>
      {!profile.experience && (
        <div className="quick-question">
          <span>How long have you been writing code?</span>
          <div>
            {EXPERIENCE.map(([value, label]) => (
              <button key={value} type="button" onClick={() => answer({ experience: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!profile.aiUse && (
        <div className="quick-question">
          <span>How often do you code with AI help?</span>
          <div>
            {AI_USE.map(([value, label]) => (
              <button key={value} type="button" onClick={() => answer({ aiUse: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
