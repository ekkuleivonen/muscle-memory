"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { acceptConsent, guessLanguage, readProfile } from "../../lib/account";
import type { LanguageId } from "../../lib/languages";
import { completed } from "../../lib/progress";
import { useHydrated, useProgress } from "../../lib/progress-hooks";
import { quickStart, type Starter } from "../../lib/quick-start";
import { logArrival, logProfile, noteArrival } from "../../lib/site-log";
import { noteStart } from "../../lib/start";
import { KeyActions } from "../_terminal/key-actions";

export interface QuickChallenge extends Starter {
  readonly title: string;
}

/**
 * Pick a language and get an easy challenge in it at once: the easiest one this device hasn't
 * completed. The language asked for in the link, or the profile's first, is offered first.
 * Starting accepts the Terms for someone new, which the line above says plainly.
 */
export function QuickStart({
  challengesJson,
  languages,
  consented,
  referral,
  preferred,
}: {
  challengesJson: string;
  languages: readonly { id: string; label: string }[];
  consented: boolean;
  /** The referral code of the shared link that brought them, if any. */
  referral: string | null;
  /** A language the link asked for. */
  preferred: string | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const progress = useProgress();
  const challenges = useMemo(
    () => JSON.parse(challengesJson) as QuickChallenge[],
    [challengesJson],
  );
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  useEffect(() => noteArrival(referral), [referral]);
  const mine = hydrated ? (readProfile()?.profile.languages ?? []) : [];
  const first = [preferred, ...mine].filter(Boolean) as string[];
  const ordered = [
    ...first.flatMap((id) => languages.filter((l) => l.id === id)),
    ...languages.filter((l) => !first.includes(l.id)),
  ];
  const picks = ordered.flatMap((language) => {
    const challenge = quickStart(challenges, language.id, (key) => completed(progress, key));
    return challenge ? [{ language, challenge }] : [];
  });
  const width = Math.max(...picks.map((p) => p.language.label.length));

  const start = async (language: string, challenge: QuickChallenge) => {
    setStarting(true);
    setError("");
    // The language's runtime starts downloading now, while practice loads, as the picker does
    // on hover. Imported here so this page doesn't carry the runner.
    void import("../../../../packages/runner/runner")
      .then(({ engineFor, warmRuntime }) => {
        const engine = engineFor(language);
        if (engine) warmRuntime(engine);
      })
      .catch(() => undefined);
    try {
      if (!consented) acceptConsent();
      // Recorded only now that the Terms are accepted: how they came (once per browser), and
      // the language picked, as a first guess at the languages answer when there is none.
      await logArrival().catch(() => undefined);
      if (!readProfile()?.profile.languages?.length) {
        guessLanguage(language as LanguageId);
        await logProfile("quick-start").catch(() => undefined);
      }
      noteStart({ key: challenge.key, from: "quick-start", query: null, position: null });
      router.push(`/challenges/${challenge.key}`);
    } catch {
      setStarting(false);
      setError("Could not save your session. Allow browser storage and try again.");
    }
  };

  return (
    <section className="quick-start">
      {!consented && (
        <p className="t-line t-dim">
          Starting means you&apos;re 16 or older and accept the{" "}
          <Link className="t-cmd" href="/terms">Terms</Link> and{" "}
          <Link className="t-cmd" href="/privacy">Privacy Notice</Link>. We
          record every keystroke in the editor and send it to our servers,
          without your name. No email needed.
        </p>
      )}
      {error && (
        <p className="t-line t-err" role="alert">
          {error}
        </p>
      )}
      <KeyActions
        id="quick-start"
        message="Pick your language"
        autoFocus
        actions={picks.map(({ language, challenge }, index) => ({
          label: `${language.label.padEnd(width)}  ${challenge.key} · ${challenge.title}`,
          kind: index === 0 ? "primary" : "plain",
          disabled: starting && "opening…",
          run: () => void start(language.id, challenge),
        }))}
      />
      <p className="t-line t-dim">
        Or{" "}
        <Link className="t-cmd" href="/challenges">
          pick one yourself
        </Link>
        .
      </p>
    </section>
  );
}
