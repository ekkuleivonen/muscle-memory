"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "../../../../../packages/domain/json";
import {
  type Revision,
} from "../../../../../packages/content/model";
import type { StoredRecord } from "../../../../../packages/domain/records";
import { LANGUAGES } from "../../../lib/languages";
import {
  encodeOutcome,
  completedRun,
  outcomeOf,
  outcomeSentence,
  publicOutcome,
  type Outcome,
} from "../../../lib/outcome";
import {
  codeFragment,
  encodeCode,
  REFUSALS,
  type CodeRefusal,
  solutionOf,
  type SharedFile,
} from "../../../lib/share";
import { logShare } from "../../../lib/site-log";
import { practiceHref } from "../../../lib/paths";
import { copyText, useReferral } from "./result-card";
import "../../share.css";

type Channel = "copy" | "x" | "linkedin" | "native";

/**
 * A small, secondary "Copy link" for anything worth sending: the challenge (`/challenges/KEY`) or
 * a shared result. It copies the absolute URL and says so; it never opens anything.
 */
export function CopyLink({
  href,
  label = "Copy link",
  className,
}: {
  /** A path on this site, e.g. practiceHref(issue.key). */
  href: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={className ? `copy-link ${className}` : "copy-link"}
      data-href={href}
      onClick={async () =>
        setCopied(await copyText(new URL(href, location.origin).href))
      }
    >
      {copied ? "Link copied" : label}
    </button>
  );
}

/** The challenge's link, from practice. */
export function CopyIssueLink({ issueKey }: { issueKey: string }) {
  return (
    <div className="share-issue">
      <CopyLink href={practiceHref(issueKey)} label="Copy challenge link" />
      <p className="faint">
        Opens {issueKey} from its starting code for whoever you send it to.
        Never your code or your attempt.
      </p>
    </div>
  );
}

/**
 * Share a completed challenge's outcome, with a preview of exactly what a post or chat will
 * show (the shared link's image), then copy, X, LinkedIn or the system share sheet. Code is
 * left out unless the person ticks the box, every time the dialog opens; when ticked, their
 * solution goes into the link itself (its fragment), complete or not at all, so no copy is
 * kept anywhere.
 */
export function ShareResult({
  state,
  issue,
  code,
}: {
  /** The card to share: a v3 outcome. */
  state: { result: Outcome | null; label: string };
  issue: { key: string; title: string; revision: string };
  /**
   * The solution as checked; only shared when ticked. "missing" when the checked copy wasn't
   * kept: the box is offered and then refuses.
   */
  code?: SharedFile | "missing";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [withCode, setWithCode] = useState(false);
  /** Once ticked: undefined while packing, then the fragment or why the code can't go in. */
  const [packed, setPacked] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<CodeRefusal | null>(null);
  const missing = code === "missing";
  // By content: the caller may build a new object on every render.
  const file = useMemo(
    () => (code && code !== "missing" ? code : null),
    [code === "missing" ? "missing" : code?.path, code === "missing" ? "" : code?.text, code === "missing" ? false : code?.truncated], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (withCode && missing) {
      setPacked(undefined);
      setRefusal("missing");
      return;
    }
    if (!withCode || !file) return;
    let live = true;
    setPacked(undefined);
    setRefusal(null);
    encodeCode(file)
      .then((value) => {
        if (!live) return;
        if (value.ok) setPacked(value.packed);
        else setRefusal(value.reason);
      })
      .catch(() => live && setRefusal("too-large"));
    return () => {
      live = false;
    };
  }, [withCode, file, missing]);
  const { result } = state;
  if (!result) return null;
  // Only allowlisted fields leave the browser.
  const card = publicOutcome(result);
  const segment = encodeOutcome(card);
  const including = withCode && !!packed;
  const url = `${location.origin}/r/${segment}${including ? codeFragment(packed) : ""}`;
  const said = outcomeSentence(card, state.label, issue.title, "first");
  const text = `${said} Keep your coding skills in practice.`;
  const share = async (channel: Channel) => {
    // Ticked but not packed yet, or refused: never share without saying so, or share part of it.
    if (withCode && !packed) return;
    void logShare(
      { key: issue.key, revision: issue.revision },
      {
        channel,
        ref: card.c,
        card: card as unknown as Json,
      },
    );
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
  const blocked = withCode && !packed;
  return (
    <>
      <button
        type="button"
        className="share-open"
        onClick={() => {
          setWithCode(false);
          setPacked(undefined);
          setRefusal(null);
          setCopied(false);
          dialog.current?.showModal();
        }}
      >
        Share result
      </button>
      <dialog
        ref={dialog}
        className="share-dialog"
        aria-label="Share your result"
        onClick={(event) =>
          event.target === dialog.current && dialog.current?.close()
        }
        onClose={() => {
          setCopied(false);
          // Every share starts without code again.
          setWithCode(false);
          setPacked(undefined);
          setRefusal(null);
        }}
      >
        <div className="share-body">
          <div className="share-head">
            <b>Share your result</b>
            <button
              type="button"
              className="share-close"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
            >
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
            {including
              ? `Your result, a link to try ${issue.key}, and your solution.`
              : `Your result and a link to try ${issue.key} from the start. Not your code.`}
          </p>
          {(file || missing) && (
            <label className="share-code">
              <input
                type="checkbox"
                checked={withCode}
                onChange={(event) => {
                  setWithCode(event.target.checked);
                  setCopied(false);
                }}
              />
              <span>
                <b>Include my code</b>
                <span className="faint">
                  {" "}
                  {file ? (
                    <>
                      Adds your solution, <code>{file.path}</code>, to the link
                      itself, in full.
                    </>
                  ) : (
                    "Adds your solution, exactly as it was checked, to the link itself."
                  )}{" "}
                  Anyone with the link can read it. We don&apos;t keep a copy;
                  untick to share without it.
                </span>
                {withCode && refusal && (
                  <span className="share-code-error" role="alert">
                    {" "}
                    {REFUSALS[refusal]} Nothing of it is shared; untick to share
                    without it.
                  </span>
                )}
              </span>
            </label>
          )}
          <div className="share-actions">
            <button
              type="button"
              className="primary"
              disabled={blocked}
              onClick={() => void share("copy")}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => void share("x")}
            >
              Post on X
            </button>
            <button
              type="button"
              disabled={blocked}
              onClick={() => void share("linkedin")}
            >
              LinkedIn
            </button>
            {"share" in navigator && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => void share("native")}
              >
                Share…
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * Optional sharing for the practice area, after the attempt open there was recorded as
 * completed. The card is version 3 (`lib/outcome.ts`): the challenge, the checked revision and
 * the attempt's recorded submissions, nothing else. Their solution is offered unticked: the
 * editable file exactly as the completing run checked it, refused when that copy is missing or
 * was kept only in part, and never the editor's current code.
 */
export function ShareOutcome({
  challenge,
  attemptId,
  records,
  revision,
}: {
  challenge: {
    key: string;
    title: string;
    revision: string;
    language: string;
  };
  attemptId: string;
  records: readonly StoredRecord[];
  revision: Revision;
}) {
  const referral = useReferral();
  const card = useMemo(
    () =>
      referral
        ? outcomeOf({
            records,
            challenge: { key: challenge.key, revision: challenge.revision },
            attemptId,
            language: challenge.language,
            referral,
          })
        : null,
    [records, attemptId, referral, challenge.key, challenge.revision, challenge.language],
  );
  const solution = useMemo(() => {
    const runId = completedRun(records, challenge.key, attemptId);
    return runId ? solutionOf(records, runId, revision.file) : null;
  }, [records, challenge.key, attemptId, revision]);
  if (!card) return null;
  const label =
    LANGUAGES.find((l) => l.id === challenge.language)?.label ??
    challenge.language;
  return (
    <ShareResult
      state={{ result: card, label }}
      issue={{
        key: challenge.key,
        title: challenge.title,
        revision: challenge.revision,
      }}
      code={solution ?? "missing"}
    />
  );
}
