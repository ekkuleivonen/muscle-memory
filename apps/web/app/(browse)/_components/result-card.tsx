"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import {
  evidenceOf,
  publicEvidence,
  type PublicEvidence,
} from "../../../lib/evidence";
import { readProfile } from "../../../lib/account";
import { LANGUAGES } from "../../../lib/languages";
import { INGEST_URL } from "../../../lib/ingest";
import {
  compare,
  metricsOf,
  receiptLines,
  type Aggregate,
  type Metrics,
  type Result,
} from "../../../lib/result";

export function Receipt({
  headline,
  detail,
  lines,
  completed,
  top,
  children,
}: {
  headline: string;
  detail: string;
  /** The card's rows: `receiptLines` for a v2 card, `outcomeLines` for v3. */
  lines: [string, string, boolean?][];
  completed: boolean;
  top: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="receipt">
      <div className="receipt-top">
        <span>{top}</span>
        <span className="receipt-merged">
          {completed ? "✔ completed" : "not completed"}
        </span>
      </div>
      <p className="receipt-head">{headline}</p>
      <p className="receipt-sub">{detail}</p>

      <dl className="receipt-rows">
        {lines.map(([label, value, good]) => (
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

/** This device's referral code, read after mount; null until then (or if storage fails). */
export function useReferral(): string | null {
  const [code, setCode] = useState<string | null>(null);
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
  return code;
}

export interface ResultInput {
  number: number;
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
  /** "Faster than 72% of people who completed it in Python.", or null. */
  comparison: string | null;
  label: string;
}

/**
 * What a merged pull request adds up to, from the person's own recorded keystrokes and runs,
 * plus the comparison with everyone else (none for stealth players) and the card to share.
 */
export function useResult(input: ResultInput | null): ResultState | null {
  const key = input?.issue.key;
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
  const code = useReferral();
  const metrics = useMemo(
    () =>
      input &&
      metricsOf(
        input.records,
        input.issue.slug,
        input.mergedAt,
        (id) => input.revisions[id],
      ),
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
  const evidence = evidenceOf({
    records: input.records,
    issue: issue.slug,
    number: input.number,
    revisionFor: (id) => input.revisions[id],
    until: input.mergedAt,
  });
  const ev = evidence
    ? publicEvidence({ ...evidence.facts, state: "merged" })
    : undefined;
  const result: Result | null = code
    ? {
        v: 2,
        k: issue.key,
        l: language,
        c: code,
        ...metrics,
        ...(ev ? { ev } : {}),
      }
    : null;
  return {
    metrics,
    result,
    comparison: null,
    label,
  };
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
 * Copies text: the Clipboard API where the page is a secure context (HTTPS, localhost), else
 * the older select-and-copy, which also works over plain HTTP (a LAN address in development).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable: try the fallback.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  // Inside the open dialog, so the modal's focus trap does not block the selection.
  (document.querySelector("dialog[open]") ?? document.body).append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
