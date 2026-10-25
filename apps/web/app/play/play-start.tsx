"use client";
import { practiceHref } from "../../lib/paths";
import Link from "next/link";
import { noteStart } from "../../lib/start";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptConsent, playLanguage } from "../../lib/account";
import type { LanguageId } from "../../lib/languages";
import {
  logArrival,
  logProfile,
  noteArrival,
} from "../../lib/site-log";

interface Choice {
  key: string;
  slug: string;
  revision: string;
  language: string;
  label: string;
}

/**
 * The language picker. Picking a language starts the test; for someone new that also accepts
 * the Terms, which the line above the buttons says plainly.
 */
export function PlayStart({
  choices,
  consented,
  referral,
  preferred,
}: {
  choices: Choice[];
  consented: boolean;
  /** The referral code of the shared result that brought them, if any. */
  referral: string | null;
  /** The language of the shared result, offered first. */
  preferred: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  useEffect(() => noteArrival(referral), [referral]);
  const ordered = [
    ...choices.filter((c) => c.language === preferred),
    ...choices.filter((c) => c.language !== preferred),
  ];
  const start = async (choice: Choice) => {
    setStarting(choice.key);
    setError("");
    try {
      if (!consented) acceptConsent();
      // Recorded only now that the Terms are accepted: how they came (once per browser), and
      // the language they picked, as a first guess at the languages answer.
      await logArrival().catch(() => undefined);
      playLanguage(choice.language as LanguageId);
      await logProfile("quick-start").catch(() => undefined);
      noteStart({ key: choice.key, from: "quick-start", query: null, position: null });
      router.push(practiceHref(choice.key));
    } catch {
      setStarting(null);
      setError(
        "Could not save your session. Allow browser storage and try again.",
      );
    }
  };
  return (
    <section className="play-start">
      <h2>Pick your language</h2>
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
      <p className="play-consent">
        You can exclude your activity from future publications with{" "}
        <Link href="/settings/privacy">stealth in Settings</Link>. Recording
        continues in stealth.
      </p>
      <div className="play-langs">
        {ordered.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={
              choice.language === preferred
                ? "play-lang preferred"
                : "play-lang"
            }
            disabled={starting !== null}
            onClick={() => void start(choice)}
          >
            {starting === choice.key ? "Opening…" : `Start in ${choice.label}`}
          </button>
        ))}
      </div>
    </section>
  );
}
