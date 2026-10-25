import Link from "next/link";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, hasConsent } from "../lib/profile";
import { Banner } from "./_terminal/banner";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

/**
 * The public front door, in one screen: what this is, a challenge to start, and a pointer to the
 * manifesto for the why. Outside the consent gate; someone who has accepted the Terms goes
 * straight to the challenges, everyone else to the five-minute test.
 */
export default async function Home() {
  const store = await cookies();
  const returning = hasConsent(store.get(CONSENT_COOKIE)?.value);
  return (
    <>
      <div className="term home">
        <Banner description="Practice without AI." />
        <main className="t-prose home-fold">
          <p className="t-line home-headline">
            <strong>Use AI at work.</strong>
            <br />
            <strong className="t-brand">Write this one yourself.</strong>
          </p>
          <p className="t-line">
            Pick a coding challenge, write the code yourself and get feedback in
            seconds. Twelve languages, in your browser, with no completion, chat
            or generated code.
          </p>
          <p className="t-line home-dare">
            {returning
              ? "Your next one is waiting. Still sharp?"
              : "A five-minute bug. No AI. Can you still fix it yourself?"}
          </p>
          <div className="home-start">
            <Link
              className="t-btn t-btn-primary"
              href={returning ? "/challenges" : "/play"}
              autoFocus
            >
              {returning
                ? "find your next challenge →"
                : "take the five-minute challenge →"}
            </Link>
            <Link className="t-cmd" href="/challenges">
              browse every challenge
            </Link>
          </div>
          <p className="t-line t-dim home-teaser">
            Why this exists, and what we record about your practice:{" "}
            <Link className="t-cmd" href="/manifesto">
              read the manifesto
            </Link>
            .
          </p>
        </main>
      </div>
      <TermFooter />
    </>
  );
}
