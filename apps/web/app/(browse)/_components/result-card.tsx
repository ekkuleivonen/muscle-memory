"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { openPracticeStore } from "../../../../../packages/browser/practice-store";
import type { Json } from "../../../../../packages/domain/json";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { LANGUAGES } from "../../../lib/languages";
import { encodeResult, resultOf, sentence, type Result } from "../../../lib/result";
import { logShare } from "./board-log";

type Channel = "copy" | "x" | "linkedin" | "native";

/**
 * What a merged pull request adds up to, and a way to share it: the issue, the language, the
 * minutes and runs it took and whether hints were needed. Nothing that ranks anyone.
 */
export function ResultCard({
  issue,
  language,
  records,
  mergedAt,
}: {
  issue: { key: string; slug: string; title: string; revision: string };
  language: string;
  records: readonly WorkspaceRecord[];
  mergedAt: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
  const numbers = useMemo(
    () => resultOf(records, issue.slug, mergedAt),
    [records, issue.slug, mergedAt],
  );
  if (!code) return null;
  const label = LANGUAGES.find((l) => l.id === language)?.label ?? language;
  const result: Result = { k: issue.key, l: language, ...numbers, c: code };
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
    <section className="result-card" aria-label="Your result">
      <p className="result-kicker">Shipped without AI</p>
      <h2>
        {issue.key} <span className="dim">· {issue.title}</span>
      </h2>
      <ul className="result-stats">
        <li>
          <b>{numbers.m}</b> {numbers.m === 1 ? "minute" : "minutes"}
        </li>
        <li>
          <b>{numbers.r}</b> {numbers.r === 1 ? "test run" : "test runs"}
        </li>
        <li>
          <b>{numbers.p}</b> {numbers.p === 1 ? "push" : "pushes"}
        </li>
        <li>
          <b>{numbers.h || "No"}</b> {numbers.h === 1 ? "hint" : "hints"}
        </li>
        <li>
          <b>{label}</b>
        </li>
      </ul>
      <p className="result-share-label">
        Share it, and see whether your friends still can.
      </p>
      <div className="result-share">
        <button type="button" onClick={() => void share("copy")}>
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
      </div>
      <p className="result-next">
        Minutes are the ones you spent typing, reading or testing.{" "}
        <Link href="/dashboard">The full workday is next →</Link>
      </p>
    </section>
  );
}
