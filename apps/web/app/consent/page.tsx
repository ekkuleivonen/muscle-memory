import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChallenges } from "../../lib/load";
import { isPracticePath } from "../../lib/paths";
import { CONSENT_COOKIE, hasConsent, safeNext } from "../../lib/profile";
import { NOT_INDEXED } from "../../lib/site";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { ConsentButton } from "./consent-button";
import { ConsentPoints } from "./consent-points";

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * Not for search results. A shared challenge link lands here for anyone (or any link preview
 * bot) without the Terms accepted, so the preview names the challenge it leads to.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const next = safeNext((await searchParams).next, "/challenges");
  const path = next.split(/[?#]/)[0];
  const challenge = isPracticePath(path)
    ? (await getChallenges()).findChallenge(decodeURIComponent(path.slice("/challenges/".length)))
    : undefined;
  if (!challenge) return { title: "Before you go in", robots: NOT_INDEXED };
  return {
    title: `${challenge.title} (${challenge.key})`,
    description: challenge.hook ?? (challenge.summary || undefined),
    robots: NOT_INDEXED,
  };
}

/**
 * The one thing every page needs: the current Terms accepted. Plain, one key or click, then on
 * to the page someone was heading for. The setup questions are not asked here.
 */
export default async function Consent({ searchParams }: Props) {
  const next = safeNext((await searchParams).next, "/challenges");
  const store = await cookies();
  if (hasConsent(store.get(CONSENT_COOKIE)?.value)) redirect(next);
  return (
    <>
      <div className="term">
        <main className="t-prose t-consent">
          <p className="t-line t-dim">
            <span className="t-ok">~</span> <span className="t-accent">$</span>{" "}
            open {next}
          </p>
          <h1 className="t-doc-title">One thing first.</h1>
          <ConsentPoints />
          <ConsentButton next={next} />
        </main>
      </div>
      <TermFooter trail={[{ label: "before you go in", href: "" }]} />
    </>
  );
}
