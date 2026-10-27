"use client";
import { useEffect, useState } from "react";
import { CopyLink } from "../_components/share";
import { practiceHref } from "../../lib/paths";

/** Set for the tab once someone chooses to solve on a phone anyway. */
const SOLVE_HERE_KEY = "muscle-memory.solve-here";

/** Whether this tab chose to solve on a phone anyway; read after mount, so hydration agrees. */
export function useSolveHere(): [boolean, () => void] {
  const [solveHere, setSolveHere] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem(SOLVE_HERE_KEY) === "1") setSolveHere(true);
  }, []);
  return [
    solveHere,
    () => {
      sessionStorage.setItem(SOLVE_HERE_KEY, "1");
      setSolveHere(true);
    },
  ];
}

/**
 * Practice is desktop-first: on a phone (a touch screen without room for code, matched in
 * practice.css) the challenge stays readable and this says where to solve it, with the
 * challenge's link to copy or send on. Hidden everywhere else. The editor stays mounted
 * underneath, so solving here anyway loses nothing.
 */
export function DesktopFirst({
  challenge,
  onSolveHere,
}: {
  challenge: { key: string; title: string };
  onSolveHere(): void;
}) {
  const href = practiceHref(challenge.key);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  return (
    <aside className="practice-desktop-first" aria-label="Solving on a phone">
      <p>
        <strong>Open on a computer to solve.</strong> Read the challenge here,
        then send yourself the link.
      </p>
      <div className="practice-desktop-first-actions">
        <CopyLink href={href} label="Copy challenge link" />
        {canShare && (
          <button
            type="button"
            className="copy-link"
            onClick={() =>
              navigator
                .share({
                  title: challenge.title,
                  url: new URL(href, location.origin).href,
                })
                .catch(() => {})
            }
          >
            Share link
          </button>
        )}
        <button type="button" className="link-button" onClick={onSolveHere}>
          Solve here anyway
        </button>
      </div>
    </aside>
  );
}
