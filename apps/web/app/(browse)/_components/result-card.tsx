"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { readProfile } from "../../../lib/account";
import { LANGUAGES } from "../../../lib/languages";
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
import { logShare } from "./board-log";

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

export interface ResultInput {
  issue: { key: string; slug: string; title: string; revision: string };
  language: string;
  records: readonly WorkspaceRecord[];
  mergedAt: string;
  revisions: Record<string, Revision>;
}

export interface ResultState {
  metrics: Metrics;
  /** The card a shared link carries; null until this device's referral code is read. */
  result: Result | null;
  /** "Faster than 72% of people who fixed it in Python.", or null. */
  comparison: string | null;
  label: string;
}

/**
 * What a merged pull request adds up to, from the person's own recorded keystrokes and runs,
 * plus the comparison with everyone else (none for stealth players) and the card to share.
 */
export function useResult(input: ResultInput | null): ResultState | null {
  const key = input?.issue.key;
  const [code, setCode] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<Aggregate | undefined>();
  useEffect(() => {
    // Stealth players are left out of the aggregates and see no comparisons.
    if (!key || !INGEST_URL || readProfile()?.stealth) return;
    let live = true;
    fetch(`${INGEST_URL}/v1/aggregates`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && key && setAggregate(body?.issues?.[key]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
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
    () =>
      input &&
      metricsOf(input.records, input.issue.slug, input.mergedAt, (id) => input.revisions[id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the inputs, not their wrapper
    [input?.records, input?.issue.slug, input?.mergedAt, input?.revisions],
  );
  if (!input || !metrics) return null;
  const { issue, language } = input;
  const label = LANGUAGES.find((l) => l.id === language)?.label ?? language;
  const { fasterThan, people } = compare(aggregate, metrics.t);
  const comparison = aggregate
    ? { fn: people, ...(fasterThan !== undefined ? { fp: fasterThan } : {}) }
    : {};
  const result: Result | null = code
    ? { v: 2, k: issue.key, l: language, c: code, ...metrics, ...comparison }
    : null;
  return { metrics, result, comparison: comparisonLine(comparison, label), label };
}

/** The result as rows for the pull request's Details: the same numbers a shared card shows. */
export function ResultFacts({ state }: { state: ResultState }) {
  return (
    <>
      {state.comparison && (
        <>
          <dt>Compared</dt>
          <dd className="result-compare">{state.comparison}</dd>
        </>
      )}
      {receiptLines(state.metrics).map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label[0].toUpperCase() + label.slice(1)}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Share, with a preview of exactly what a post or chat will show (the shared link's image),
 * then copy, X, LinkedIn or the system share sheet. The fix itself is never shared.
 */
export function ShareResult({
  state,
  issue,
}: {
  state: ResultState;
  issue: ResultInput["issue"];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const { result } = state;
  if (!result) return null;
  const segment = encodeResult(result);
  const url = `${location.origin}/r/${segment}`;
  const text = `${sentence(result, state.label)} Can you still code without it?`;
  const share = async (channel: Channel) => {
    void logShare(
      { id: issue.slug, revision: issue.revision },
      { issueKey: issue.key, channel, ref: result.c, card: result as unknown as Json },
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
    <>
      <button type="button" className="share-open" onClick={() => dialog.current?.showModal()}>
        Share result
      </button>
      <dialog
        ref={dialog}
        className="share-dialog"
        aria-label="Share your result"
        onClick={(event) => event.target === dialog.current && dialog.current?.close()}
        onClose={() => setCopied(false)}
      >
        <div className="share-body">
          <div className="share-head">
            <b>Share your result</b>
            <button type="button" className="share-close" aria-label="Close" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the generated preview, as posted */}
          <img
            className="share-preview"
            src={`/r/${segment}/opengraph-image`}
            alt={text}
            width={1200}
            height={630}
          />
          <p className="share-text">{text}</p>
          <p className="faint share-note">
            Your numbers and a link to try the same bug. Never your code.
          </p>
          <div className="share-actions">
            <button type="button" className="primary" onClick={() => void share("copy")}>
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
        </div>
      </dialog>
    </>
  );
}
