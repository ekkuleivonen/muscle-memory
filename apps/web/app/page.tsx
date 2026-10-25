import Link from "next/link";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, hasConsent } from "../lib/profile";

/**
 * The public front door: why someone who builds with AI might write one issue themselves, the
 * loop every issue follows, and what is recorded. Outside the consent gate; returning players
 * get a way back to their desk.
 */

/** The loop every issue follows, as it actually goes in the workspace. */
const LOOP = [
  [
    "01",
    "Issue",
    "A bug report or feature request, written the way a teammate would file it.",
  ],
  [
    "02",
    "Code",
    "Change the files the fix needs, in an editor you already know.",
  ],
  [
    "03",
    "Tests",
    "Run them as often as you like before anyone else sees the code.",
  ],
  ["04", "Pull request", "CI runs every check on exactly the code you pushed."],
  ["05", "Feedback", "Review may ask for changes before it can merge."],
  [
    "06",
    "Merge",
    "Checks green and review addressed: merge, and the issue is Done.",
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
      Fix your first bug →
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
          <Link href="/issues">Issues</Link>
          <Link href="/dashboard">{signedIn ? "Your desk" : "Clock in"}</Link>
        </nav>
      </header>

      <main className="legal-body home-body">
        <section className="home-hero">
          <p className="home-kicker">Practice without AI</p>
          <h1>
            Use AI at work.
            <br />
            <span className="home-punch">Write this one yourself.</span>
          </h1>
          <p className="home-lede">
            AI can help you build more than you could alone. You may also have
            noticed moments where the code works and you&apos;re not quite sure
            why. Here, take one realistic issue from bug report to merge and
            work through every part of it yourself.
          </p>
          <div className="home-actions">
            {start}
            <span className="home-note">
              No email needed. Progress stays in this browser.{" "}
              {signedIn ? (
                <Link href="/issues">Browse issues</Link>
              ) : (
                <>
                  Or <Link href="/issues">browse every issue</Link>.
                </>
              )}
            </span>
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
            The actual workspace, before any edits: the issue, the code and its
            tests.
          </figcaption>
        </figure>

        <section className="home-section">
          <h2>From bug report to merge</h2>
          <p>
            A check fails. You read what came back, form a hunch and try it.
            Wrong. Then it clicks: you see why, make the change, and it goes
            green. The fix is yours, and so is the understanding.
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
            After the merge, look back at what you changed, what CI caught and
            how you got there. No scores, ranks or badges, and nothing here is a
            hiring signal.
          </p>
          <p className="home-fine">
            Python, JavaScript, TypeScript, SQL, HTML, PHP, Ruby, Go, C, C++, C#
            and Java, running in your browser. Syntax highlighting, type errors
            and hover types are on. Completion, chat and generated code are off.
          </p>
        </section>

        <section className="home-section">
          <h2>Why it records your practice</h2>
          <p>
            This isn&apos;t a case for going back to coding without AI. It is
            part of how software gets built now, and nothing here asks you to
            give it up. What it changes about how developers work and understand
            their code, good or bad, is still an open question. Unaided practice
            is what we record, to help study it in the open; it is not a verdict
            on you or on AI.
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
          <h2>This one&apos;s yours.</h2>
          <p>
            Pick a bug, make it green and merge it. It&apos;s an early preview,
            and the issues are still growing toward the messy, multi-file work
            of a real job.
          </p>
          <div className="home-actions">{start}</div>
        </section>
      </main>
    </div>
  );
}
