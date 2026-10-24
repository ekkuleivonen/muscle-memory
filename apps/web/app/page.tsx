import Link from "next/link";
import { cookies } from "next/headers";
import { isOnboarded, ONBOARDING_COOKIE } from "../lib/onboarding";

/**
 * The public front door: the question that brings people here, what they get, and why it
 * matters, in that order. Outside the onboarding gate; returning players get a way back to
 * their desk instead of the first-day invite.
 */

/** The first day, as it actually goes: Terms, setup questions, the first ticket. */
const SCHEDULE = [
  ["9:00", "Paperwork", "Short, plain Terms and a Privacy Notice."],
  [
    "9:05",
    "Setup",
    "Five questions: experience, how much you code with AI, the languages you work with, why you're here, Vim or not.",
  ],
  [
    "9:10",
    "Your first ticket",
    "A feature, a bug, a slow query, or the refactor nobody wanted.",
  ],
  [
    "4:55",
    "Review and merge",
    "CI has run every check. Read your own diff, merge it, and the ticket moves to Done.",
  ],
];

export default async function Home() {
  const onboarded = isOnboarded((await cookies()).get(ONBOARDING_COOKIE)?.value);
  const start = onboarded ? (
    <Link className="home-cta" href="/dashboard">
      Back to your desk →
    </Link>
  ) : (
    <Link className="home-cta" href="/play">
      Take the five-minute test →
    </Link>
  );

  return (
    <div className="legal home">
      <header className="legal-head">
        <Link href="/" className="workspace-name">
          <img
            className="logo-mark"
            src="/logo.svg"
            alt=""
            width={22}
            height={22}
          />
          muscle memory
        </Link>
        <nav>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href={onboarded ? "/dashboard" : "/onboarding"}>
            {onboarded ? "Your desk" : "Clock in"}
          </Link>
        </nav>
      </header>

      <main className="legal-body home-body">
        <section className="home-hero">
          <p className="home-kicker">Muscle Memory Inc. · Est. before AI</p>
          <h1>
            You use AI every day.
            <br />
            <span className="home-punch">Can you still code without it?</span>
          </h1>
          <p className="home-lede">
            A developer job from before AI: tickets, tests, a pull request, and
            nobody writing it for you. Find out what your hands still remember.
          </p>
          <div className="home-actions">
            {start}
            {!onboarded && (
              <span className="home-note">
                No account, no email, no AI. Or{" "}
                <Link href="/onboarding">start your first day</Link>.
              </span>
            )}
          </div>
        </section>

        <section className="home-section">
          <h2>Your first day</h2>
          <ol className="home-schedule">
            {SCHEDULE.map(([time, title, detail]) => (
              <li key={time}>
                <time>{time}</time>
                <span>
                  <strong>{title}.</strong> {detail}
                </span>
              </li>
            ))}
          </ol>
          <p className="home-fine">
            Python, JavaScript, TypeScript, SQL, HTML, PHP, Ruby, Go, C, C++, C#
            and Java, running in your browser. Syntax highlighting, type errors
            and hover types are on. Completion, chat and generated code are off,
            and always will be.
          </p>
        </section>

        <section className="home-section">
          <h2>What you get</h2>
          <ul className="home-promises">
            <li>
              <strong>An honest read on your skills.</strong> What you can still
              do from memory, what went rusty, and whether practice brings it
              back.
            </li>
            <li>
              <strong>Progress only you see.</strong> Compare yourself with
              yourself and with anonymous aggregates. No leaderboards, and
              nothing here is a hiring signal.
            </li>
          </ul>
        </section>

        <section className="home-section">
          <h2>Why it matters</h2>
          <p>
            Everyone has a take on what AI is doing to developers&apos; skills.
            Nobody has data. Your practice helps change that: unaided work is
            what we measure, not a moral stance, so use all the AI you like at
            your day job.
          </p>
          <ul className="home-promises">
            <li>
              <strong>Raw data and interpretation are kept apart.</strong> We
              record what happened (keystrokes, runs, results) and version every
              assessment we draw from it. Methods and null results get published
              too.
            </li>
            <li>
              <strong>Signals are footnotes, not accusations.</strong> Where we
              record signals like pasting or leaving the tab, they only tell us
              how much salt to apply to the data. Nobody polices you.
            </li>
            <li>
              <strong>Anonymous, with a way out.</strong> Published data is
              anonymised. Go stealth to keep your results out of published
              stats, or delete everything, any time. See the{" "}
              <Link href="/terms">Terms</Link> and{" "}
              <Link href="/privacy">Privacy Notice</Link>.
            </li>
          </ul>
        </section>

        <section className="home-section home-invite">
          <h2>Your desk is ready.</h2>
          <p>
            It&apos;s an early preview: the tickets are still growing toward the
            messy, multi-file work of a real job. Start with the five-minute
            test, or go straight to your first day.
          </p>
          <div className="home-actions">
            {start}
            {!onboarded && (
              <Link className="home-note" href="/onboarding">
                Start your first day instead
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
