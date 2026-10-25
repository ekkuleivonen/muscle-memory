import type { Metadata } from "next";
import { cookies } from "next/headers";
import { languageLabel } from "../../lib/challenges";
import { getChallenges } from "../../lib/load";
import { hasConsent, CONSENT_COOKIE } from "../../lib/profile";
import { pageMetadata } from "../../lib/site";
import { Banner } from "../_terminal/banner";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { QuickStart, type QuickChallenge } from "./quick-start";

export const metadata: Metadata = pageMetadata({
  title: "Quick start",
  description:
    "An easy coding challenge in your language, in your browser. No AI, no autocomplete.",
  path: "/start",
});

type Props = { searchParams: Promise<{ ref?: string; lang?: string }> };

/**
 * Quick start: pick a language, get an easy challenge in it. Public, like the home page:
 * starting accepts the Terms, and the profile questions wait until someone answers them.
 */
export default async function Start({ searchParams }: Props) {
  const { ref, lang } = await searchParams;
  const store = await cookies();
  const consented = hasConsent(store.get(CONSENT_COOKIE)?.value);
  const { challenges } = await getChallenges();
  const runnable = challenges.filter((i) => i.runnable && i.language);
  const quick: QuickChallenge[] = runnable.map((i) => ({
    key: i.key,
    language: i.language!,
    difficulty: i.difficulty,
    title: i.title,
  }));
  const languages = [...new Set(runnable.map((i) => i.language!))]
    .map((id) => ({ id, label: languageLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <>
      <div className="term">
        <Banner description="Practice without AI." />
        <main className="t-prose">
          <p className="t-line">
            An easy challenge in your language. Write the code yourself and
            submit it for feedback in seconds. No completion, chat or generated
            code.
          </p>
          <QuickStart
            challengesJson={JSON.stringify(quick)}
            languages={languages}
            consented={consented}
            referral={ref ?? null}
            preferred={lang ?? null}
          />
        </main>
      </div>
      <TermFooter trail={[{ label: "start", href: "/start" }]} />
    </>
  );
}
