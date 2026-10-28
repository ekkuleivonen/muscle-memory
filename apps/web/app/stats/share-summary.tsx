"use client";
/**
 * Sharing the report, only when the player asks (ENG-394): a quiet button opens a preview of the
 * exact text, built from a few counts (`ShareSummary`), and the player copies, shares or
 * downloads it, or closes the preview. Nothing is posted, uploaded or logged, and no link
 * carries their data. The preview always shows the current report: when the report goes away
 * (stealth, logout, reset, deletion, import) this unmounts with it, and the dialog with it.
 */
import React, { useEffect, useRef, useState } from "react";
import { shareText, type ShareSummary } from "../../lib/report";
import { SITE_URL } from "../../lib/site";
import { copyText } from "../_components/result-card";

type Said = "copied" | "copy-failed" | "downloaded" | "share-failed" | null;
const SAID: Record<Exclude<Said, null>, string> = {
  copied: "Copied.",
  "copy-failed": "Couldn't copy here. Select the text above and copy it yourself.",
  downloaded: "Saved as a text file.",
  "share-failed": "Sharing isn't available here. Copy the text instead.",
};

export function ShareReport({ summary }: { summary: ShareSummary }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const live = useRef(true);
  const [said, setSaid] = useState<Said>(null);
  const [canShare, setCanShare] = useState(false);
  const text = shareText(summary, SITE_URL);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // A message about an earlier text never stays beside a new one.
  useEffect(() => setSaid(null), [text]);
  const say = (s: Said) => live.current && setSaid(s);
  return (
    <>
      <button
        type="button"
        ref={opener}
        className="t-cmd report-share-open"
        aria-haspopup="dialog"
        onClick={() => {
          setSaid(null);
          // Asked each time: only offer the system share sheet where this browser has one.
          setCanShare(typeof navigator.share === "function");
          if (!dialog.current?.open) dialog.current?.showModal();
        }}
      >
        Share a summary
      </button>
      <dialog
        ref={dialog}
        className="share-dialog report-share"
        aria-labelledby="report-share-title"
        onClick={(event) => event.target === dialog.current && dialog.current?.close()}
        onClose={() => {
          setSaid(null);
          opener.current?.focus();
        }}
      >
        <div className="share-body">
          <div className="share-head">
            <b id="report-share-title">Share a summary</b>
            <button type="button" className="share-close" aria-label="Close" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </div>
          <p className="share-note">Exactly this text, and only if you choose to copy, share or save it:</p>
          <pre className="report-share-preview" tabIndex={0} aria-label="The summary">
            {text}
          </pre>
          <p className="share-note faint">
            Counts only: no code, no challenge names, times or dates, no profile or after-solve
            answers, and nothing that identifies you. Nothing is posted or uploaded for you.
          </p>
          <div className="share-actions">
            <button type="button" className="primary" onClick={async () => say((await copyText(text)) ? "copied" : "copy-failed")}>
              Copy text
            </button>
            {canShare && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.share({ text });
                  } catch (error) {
                    // Closing the share sheet is a choice, not a failure.
                    if ((error as DOMException)?.name !== "AbortError") say("share-failed");
                  }
                }}
              >
                Share…
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "muscle-memory-summary.txt";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                say("downloaded");
              }}
            >
              Download
            </button>
          </div>
          <p className="share-note" role="status">
            {said ? SAID[said] : ""}
          </p>
        </div>
      </dialog>
    </>
  );
}
