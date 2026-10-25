"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptConsent } from "../../../lib/account";
import { statusOf } from "../../../lib/board";
import { useBoard } from "../../(browse)/_components/board";
import { logArrival, noteArrival } from "../../(browse)/_components/board-log";

/**
 * Starting a shared challenge. For someone new it also accepts the Terms, which the line above
 * the button says plainly, as on /play. It opens the visitor's own attempt: from the starting
 * code, or where they left it if they had started it here before.
 */
export function TryStart({
  issue,
  consented,
  runnable,
}: {
  issue: { key: string; slug: string; revision: string };
  consented: boolean;
  runnable: boolean;
}) {
  const router = useRouter();
  const { items, move } = useBoard();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => noteArrival(null), []);
  const status = consented ? statusOf(items, issue.key) : undefined;
  const start = async (via: "pointer" | "keyboard") => {
    setStarting(true);
    setError("");
    try {
      if (!consented) acceptConsent();
      await logArrival().catch(() => undefined);
      move(issue, "in-progress", via, { trigger: "start-work" });
      router.push(`/work/${issue.key}`);
    } catch {
      setStarting(false);
      setError("Could not save your session. Allow browser storage and try again.");
    }
  };
  return (
    <section className="play-start try-start">
      {!consented && (
        <p className="play-consent">
          Starting means you&apos;re 16 or older and accept the{" "}
          <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy Notice</Link>. We record every keystroke
          in the editor and send it to our servers, without your name. No email
          needed. Your handle, code and progress stay in this browser; uploads
          do not provide backup or device sync.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="home-actions">
        <button
          type="button"
          className="home-cta"
          disabled={starting}
          onClick={(event) => void start(event.detail === 0 ? "keyboard" : "pointer")}
        >
          {starting
            ? "Opening…"
            : status === "in-progress"
              ? `Continue your attempt at ${issue.key} →`
              : `Start ${issue.key} yourself →`}
        </button>
      </div>
      <p className="faint try-note">
        You start from the same code as everyone else. A link never brings
        anyone else&apos;s code, progress or results with it.
        {!runnable &&
          " Checks aren't available for this challenge yet; you can still open and edit the code."}
      </p>
    </section>
  );
}
