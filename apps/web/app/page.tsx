import Link from "next/link";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, hasConsent } from "../lib/profile";

/**
 * The public front door: tonight's incident first (the hook), then what the practice is, what
 * people get, and why it matters. Outside the consent gate; returning players also get a way
 * back to their desk.
 */

/** The first day, as it actually goes: Terms, the desk, the first ticket. */
const SCHEDULE = [
  ["01", "Paperwork", "Short, plain Terms and a Privacy Notice."],
  [
    "02",
    "Your desk",
    "A board, a backlog and a team. No forms: questions about you come up where they matter, and you can always say not now.",
  ],
  [
    "03",
    "Your first ticket",
    "A feature, a bug, a slow query, or the refactor nobody wanted.",
  ],
  [
    "04",
    "Review and merge",
    "CI has run every check. Read your own diff, merge it, and the ticket moves to Done.",
  ],
];

export default async function Home() {
  const store = await cookies();
  // Anyone who accepted the Terms has a desk.
  const signedIn = hasConsent(store.get(CONSENT_COOKIE)?.value);
  const start = signedIn ? (
    <Link className="home-cta" href="/dashboard">
      Back to your desk →
    </Link>
  ) : (
    <Link className="home-cta" href="/play">
      Take the five-minute test →
    </Link>
  );
  const incident = (
    <Link className="home-cta" href="/incident">
      Take the incident →
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
          <Link href={signedIn ? "/dashboard" : "/dashboard"}>
            {signedIn ? "Your desk" : "Clock in"}
          </Link>
        </nav>
      </header>

      <main className="legal-body home-body">
        <section className="home-hero home-incident">
          <p className="home-kicker">
            <span className="incident-sev">SEV-1</span> Paged 02:14 ·
            checkout-api · a fictional shop
          </p>
          <h1>
            Production is down. AI is down.
            <br />
            <span className="home-punch">You&apos;re on call.</span>
          </h1>
          <p className="home-lede">
            Kettlebrook runs on AI tools. Tonight checkout breaks while every
            one of them is unavailable. You get the logs, the code, a failing
            test and a team chat. Can you restore service? Five to ten minutes,
            no timer.
          </p>
          <div className="home-actions">
            {incident}
            <span className="home-note">
              No email needed. Progress stays in this browser.{" "}
              {signedIn ? (
                <Link href="/dashboard">Back to your desk</Link>
              ) : (
                <>
                  Or <Link href="/play">take the five-minute test</Link>.
                </>
              )}
            </span>
          </div>
        </section>
        <section className="home-section">
          <h2>A developer job from before AI</h2>
          <p>
            The incident is one shift. The rest is a job: tickets, tests, a
            pull request, and nobody writing it for you. Start with a small bug
            in about five minutes, or work at your own pace.
          </p>
          <div className="home-actions">
            {start}
            {!signedIn && (
              <span className="home-note">
                No email needed. Or{" "}
                <Link href="/dashboard">start your first day</Link>.
              </span>
            )}
          </div>
        </section>

        <figure className="home-workspace-preview">
          <img
            src="/workspace-preview.png"
            width={1120}
            height={650}
            alt="Muscle Memory workspace: a bug ticket beside its starter Python file, with Tests, Output and Pull requests tabs below."
          />
          <figcaption>
            The actual workspace, before any edits: ticket, starter code and
            tests together. Your solution is yours to write.
          </figcaption>
        </figure>
        <section className="home-section">
          <h2>A short practice session</h2>
          <ol className="home-schedule">
            {SCHEDULE.map(([time, title, detail]) => (
              <li key={time}>
                <span className="mono">{time}</span>
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
              <strong>Progress only you see.</strong> Review your runs, code
              changes and merged fixes. Community comparisons need published
              aggregate data; model benchmarks are planned. No leaderboards, and
              nothing here is a hiring signal.
            </li>
          </ul>
        </section>

        <section className="home-section">
          <h2>Why it matters</h2>
          <p>
            Everyone has a take on what AI is doing to developers&apos; skills.
            We want to add evidence. Your practice helps change that: unaided
            work is what we measure, not a moral stance, so use all the AI you
            like at your day job.
          </p>
          <ul className="home-promises">
            <li>
              <strong>Raw data and interpretation are kept apart.</strong> We
              record what happened (keystrokes, runs, results) and version every
              assessment we draw from it. We plan to publish research methods
              and null results too.
            </li>
            <li>
              <strong>Signals are footnotes, not accusations.</strong> Where we
              record signals like pasting or leaving the tab, they only tell us
              how much salt to apply to the data. Nobody polices you.
            </li>
            <li>
              <strong>Anonymous, with a way out.</strong> Future published data
              will be anonymised. Go stealth to keep your results out of
              published stats, or delete everything, any time. See the{" "}
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
            {!signedIn && (
              <Link className="home-note" href="/dashboard">
                Start your first day instead
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
