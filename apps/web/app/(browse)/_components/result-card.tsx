"use client";
import { useEffect, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Revision } from "../../../../../packages/content/model";
import type { StoredRecord } from "../../../../../packages/domain/records";

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
  /** The card's rows, from `outcomeLines`. */
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
  records: readonly StoredRecord[];
  mergedAt: string;
  revisions: Record<string, Revision>;
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
