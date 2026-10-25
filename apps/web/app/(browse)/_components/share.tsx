"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Json } from "../../../../../packages/domain/json";
import {
  editableFiles,
  type Revision,
} from "../../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { LANGUAGES } from "../../../lib/languages";
import {
  encodeOutcome,
  outcomeOf,
  outcomeSentence,
  publicOutcome,
  type Outcome,
  type RecordedCompletion,
} from "../../../lib/outcome";
import {
  encodeResult,
  publicResult,
  sentence,
  type Result,
} from "../../../lib/result";
import {
  codeFragment,
  encodeCode,
  REFUSALS,
  type CodeRefusal,
  solutionOf,
  tryHref,
  type SharedFile,
} from "../../../lib/share";
import { logShare } from "./board-log";
import { copyText, useReferral, type ResultInput } from "./result-card";
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
  /** The card to share: a v3 outcome, or a legacy v2 result (a merged pull request). */
  state: { result: Result | Outcome | null; label: string };
  issue: ResultInput["issue"];
  /**
   * The solution as checked: the file edited (or every file changed); only shared when ticked.
   * "missing" when the checked copy wasn't kept: the box is offered and then refuses.
   */
  code?: readonly SharedFile[] | "missing";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [withCode, setWithCode] = useState(false);
  /** Once ticked: undefined while packing, then the fragment or why the code can't go in. */
  const [packed, setPacked] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<CodeRefusal | null>(null);
  // By content: the caller may build a new array on every render.
  const missing = code === "missing";
  const files = useMemo(
    () => (Array.isArray(code) && code.length ? code : null),
    [JSON.stringify(code ?? [])],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (withCode && missing) {
      setPacked(undefined);
      setRefusal("missing");
      return;
    }
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
  }, [withCode, files, missing]);
  const { result } = state;
  if (!result) return null;
  // Only allowlisted fields leave the browser, whichever version the card is.
  const card = result.v === 3 ? publicOutcome(result) : publicResult(result);
  const segment = card.v === 3 ? encodeOutcome(card) : encodeResult(card);
  const including = withCode && !!packed;
  const url = `${location.origin}/r/${segment}${including ? codeFragment(packed) : ""}`;
  const said =
    card.v === 3
      ? outcomeSentence(card, state.label, issue.title, "first")
      : sentence(card, state.label, issue.title, "first");
  const text = `${said} Keep your coding skills in practice.`;
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
              ? `Your result, a link to try ${issue.key}, and your solution.`
              : `Your result and a link to try ${issue.key} from the start. Not your code.`}
          </p>
          {(count > 0 || missing) && (
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
                  {missing ? (
                    "Adds your solution, exactly as it was checked, to the link itself."
                  ) : count === 1 ? (
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

/**
 * Optional sharing for the practice area, after a recorded `checks-passed` completion of the
 * challenge open there; nothing before one, nothing for a legacy merge, and nothing for a
 * completion on another revision. The card is version 3 (`lib/outcome.ts`): the challenge, the
 * checked revision and its recorded full checks, nothing else. Their solution is offered
 * unticked: the editable file exactly as the completing run checked it, refused when that copy
 * is missing or was kept only in part, and never the editor's current code.
 */
export function ShareOutcome({
  challenge,
  completion,
  records,
  revisions,
}: {
  challenge: {
    key: string;
    slug: string;
    title: string;
    revision: string;
    language: string;
  };
  /** The latest recorded completion for this challenge (`completions(...).at(-1)`), or null. */
  completion: RecordedCompletion | null;
  records: readonly WorkspaceRecord[];
  revisions: Readonly<Record<string, Revision>>;
}) {
  const referral = useReferral();
  const done =
    completion &&
    completion.automatic &&
    completion.issue === challenge.slug &&
    completion.key === challenge.key &&
    completion.revision === challenge.revision
      ? completion
      : null;
  const card = useMemo(
    () =>
      done && referral
        ? outcomeOf({
            records,
            completion: done,
            language: challenge.language,
            referral,
          })
        : null,
    [records, done, referral, challenge.language],
  );
  const solution = useMemo(() => {
    const revision = done && revisions[done.revision];
    return revision
      ? solutionOf(
          records,
          done.runId,
          Object.keys(editableFiles(revision.workspace)),
        )
      : null;
  }, [records, done, revisions]);
  if (!card) return null;
  const label =
    LANGUAGES.find((l) => l.id === challenge.language)?.label ??
    challenge.language;
  return (
    <ShareResult
      state={{ result: card, label }}
      issue={{
        key: challenge.key,
        slug: challenge.slug,
        title: challenge.title,
        revision: challenge.revision,
      }}
      code={solution ?? "missing"}
    />
  );
}
