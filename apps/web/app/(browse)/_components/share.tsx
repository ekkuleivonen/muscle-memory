"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "../../../../../packages/domain/json";
import { encodeResult, publicResult, sentence } from "../../../lib/result";
import {
  codeFragment,
  encodeCode,
  REFUSALS,
  type CodeRefusal,
  tryHref,
  type SharedFile,
} from "../../../lib/share";
import { logShare } from "./board-log";
import { copyText, type ResultInput, type ResultState } from "./result-card";
import "../../share.css";

type Channel = "copy" | "x" | "linkedin" | "native";

/**
 * A small, secondary "Copy link" for anything with a public page: the challenge (`/try/KEY`) or
 * a shared result. It copies the absolute URL and says so; it never opens anything.
 */
export function CopyLink({
  href,
  label = "Copy link",
  className,
}: {
  /** A path on this site, e.g. tryHref(issue.key). */
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

/** The challenge's public link, for the challenge page and wherever it is worked on. */
export function CopyIssueLink({ issueKey }: { issueKey: string }) {
  return (
    <div className="share-issue">
      <CopyLink href={tryHref(issueKey)} label="Copy challenge link" />
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
 * solution file (every changed file, for a challenge that had several) goes into the link
 * itself (its fragment), complete or not at all, so no copy is kept anywhere.
 */
export function ShareResult({
  state,
  issue,
  code,
}: {
  state: ResultState;
  issue: ResultInput["issue"];
  /** The solution as checked: the file edited (or every file changed); only shared when ticked. */
  code?: readonly SharedFile[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [withCode, setWithCode] = useState(false);
  /** Once ticked: undefined while packing, then the fragment or why the code can't go in. */
  const [packed, setPacked] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<CodeRefusal | null>(null);
  // By content: the caller may build a new array on every render.
  const files = useMemo(
    () => (code?.length ? code : null),
    [JSON.stringify(code ?? [])],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!withCode || !files) return;
    let live = true;
    setPacked(undefined);
    setRefusal(null);
    encodeCode(files)
      .then((value) => {
        if (!live) return;
        if (value.ok) setPacked(value.packed);
        else setRefusal(value.reason);
      })
      .catch(() => live && setRefusal("too-large"));
    return () => {
      live = false;
    };
  }, [withCode, files]);
  const { result } = state;
  if (!result) return null;
  const card = publicResult(result);
  const segment = encodeResult(card);
  const including = withCode && !!packed;
  const url = `${location.origin}/r/${segment}${including ? codeFragment(packed) : ""}`;
  const text = `${sentence(card, state.label, issue.title)} Keep your coding skills in practice.`;
  const share = async (channel: Channel) => {
    // Ticked but not packed yet, or refused: never share without saying so, or share part of it.
    if (withCode && !packed) return;
    void logShare(
      { id: issue.slug, revision: issue.revision },
      {
        issueKey: issue.key,
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
  const count = files?.length ?? 0;
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
              ? `Your numbers, a link to try ${issue.key}, and your solution.`
              : `Your numbers and a link to try ${issue.key} from the start. Not your code.`}
          </p>
          {count > 0 && (
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
                  {count === 1 ? (
                    <>
                      Adds your solution, <code>{files![0].path}</code>, to the
                      link itself, in full.
                    </>
                  ) : (
                    `Adds all ${count} files you changed to the link itself, in full.`
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
