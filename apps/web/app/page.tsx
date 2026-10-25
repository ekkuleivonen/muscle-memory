import Link from "next/link";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, hasConsent } from "../lib/profile";
import { Banner } from "./_terminal/banner";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

/**
 * The public front door: why someone who builds with AI might write one challenge themselves,
 * the loop every challenge follows (challenge, code, feedback, next), and what is recorded.
 * Outside the consent gate; returning players get a way back to practice.
 */

/** The loop every challenge follows. */
const LOOP = [
  [
    "01",
    "Challenge",
    "A bug to fix, something to build or an algorithm to write, with a plain goal.",
  ],
  ["02", "Code", "Write the solution yourself."],
  [
    "03",
    "Feedback",
    "Run checks, understand what needs attention, and try again. When it passes, choose your next challenge.",
  ],
];

export default async function Home() {
  const store = await cookies();
  // Anyone who accepted the Terms has challenges to come back to.
  const signedIn = hasConsent(store.get(CONSENT_COOKIE)?.value);
  const startHref = signedIn ? "/dashboard" : "/play";
  const startLabel = signedIn
    ? "continue where you left off"
    : "try a challenge";
  const start = (
    <Link className="home-cta" href={startHref}>
      {signedIn ? "Continue where you left off →" : "Try a challenge →"}
    </Link>
  );

  return (
    <>
      <div className="term home">
        <Banner
          description="Practice without AI."
          status={
            signedIn ? (
              <>
                <span className="t-on">●</span> signed in on this browser
              </>
            ) : (
              <>○ no account needed · progress stays in this browser</>
            )
          }
        />
        <div className="t-with-island">
          <main className="t-prose">
            <p className="t-line home-headline">
              <strong>Use AI at work.</strong>
              <br />
              <strong className="t-brand">Write this one yourself.</strong>
            </p>
            <p className="t-line">
              AI can help you build more than you could alone. You may also have
              noticed moments where the code works and you&apos;re not quite
              sure why. Here you pick a challenge, write the code yourself and
              get direct feedback. Then the next one.
            </p>

            <section className="home-section">
              <h2>Challenge, code, feedback</h2>
              <p>
                A check fails. You form a hunch, try it and look again. There is
                a particular satisfaction in seeing why it failed, changing the
                code and watching it pass.
              </p>
              <ol className="home-schedule">
                {LOOP.map(([step, title, detail]) => (
                  <li key={step}>
                    <span className="mono">{step}</span>
                    <span>
                      <strong>{title}.</strong> {detail}
                    </span>
                  </li>
                ))}
              </ol>
              <p>
                Afterwards you have a record of these attempts, not a verdict on
                your ability or a hiring assessment.
              </p>
              <p className="home-fine">
                Python, JavaScript, TypeScript, SQL, HTML, PHP, Ruby, Go, C,
                C++, C# and Java, running in your browser. Syntax highlighting,
                type errors and hover types are on. Completion, chat and
                generated code are off.
              </p>
            </section>

            <section className="home-section">
              <h2>Why it records your practice</h2>
              <p>
                This isn&apos;t a case for going back to coding without AI. It
                is part of how software gets built now, and nothing here asks
                you to give it up. What it changes about how developers work and
                understand their code, good or bad, is still an open question.
                Unaided practice is what we record, to help study it in the
                open; it is not a verdict on you or on AI.
              </p>
              <ul className="home-promises">
                <li>
                  <strong>Raw data and interpretation are kept apart.</strong>{" "}
                  We record what happened (keystrokes, runs, results) and
                  version every assessment we draw from it. We plan to publish
                  research methods and null results too.
                </li>
                <li>
                  <strong>Signals are footnotes, not accusations.</strong> Where
                  we record signals like pasting or leaving the tab, they only
                  tell us how much salt to apply to the data. Nobody polices
                  you.
                </li>
                <li>
                  <strong>Anonymous, with a way out.</strong> Future published
                  data will be anonymised. Go stealth to keep your results out
                  of published stats, or delete everything, any time. See the{" "}
                  <Link href="/terms">Terms</Link> and{" "}
                  <Link href="/privacy">Privacy Notice</Link>.
                </li>
              </ul>
            </section>

            <section className="home-section home-invite">
              <h2>This one&apos;s yours.</h2>
              <p>
                Pick a challenge and write it yourself. It&apos;s an early
                preview, with more challenges to come.
              </p>
              <div className="home-actions">{start}</div>
            </section>
          </main>
          <aside className="t-island" aria-label="Start">
            <Link className="t-btn t-btn-primary" href={startHref}>
              {startLabel} →
            </Link>
            <Link className="t-btn" href="/challenges">
              explore every challenge
            </Link>
          </aside>
        </div>
      </div>
      <TermFooter />
    </>
  );
}
