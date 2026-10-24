"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Json } from "../../../../packages/domain/json";
import { acceptConsent, playLanguage } from "../../lib/account";
import type { LanguageId } from "../../lib/languages";
import { logArrival, logProfile, noteArrival } from "../(browse)/_components/board-log";

interface Choice {
  key: string;
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
  const [starting, setStarting] = useState<string | null>(null);
  useEffect(() => noteArrival(referral), [referral]);
  const ordered = [
    ...choices.filter((c) => c.language === preferred),
    ...choices.filter((c) => c.language !== preferred),
  ];
  const start = async (choice: Choice) => {
    setStarting(choice.key);
    if (!consented) acceptConsent();
    // Recorded only now that the Terms are accepted: how they came (once per browser), and
    // the language they picked, as the same languages answer onboarding asks for.
    await logArrival().catch(() => undefined);
    const profile = playLanguage(choice.language as LanguageId);
    await logProfile({ from: "play", answers: { ...profile } as Json }).catch(() => undefined);
    router.push(`/work/${choice.key}`);
  };
  return (
    <section className="play-start">
      <h2>Pick your language</h2>
      <div className="play-langs">
        {ordered.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={choice.language === preferred ? "play-lang preferred" : "play-lang"}
            disabled={starting !== null}
            onClick={() => void start(choice)}
          >
            {starting === choice.key ? "Opening…" : choice.label}
          </button>
        ))}
      </div>
      {!consented && (
        <p className="play-consent">
          Starting means you&apos;re 16 or older and accept the{" "}
          <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Notice</Link>. We
          record every keystroke in the editor and send it to our servers, without your name.
          No account, no email.
        </p>
      )}
    </section>
  );
}
