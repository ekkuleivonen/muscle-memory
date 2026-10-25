import Link from "next/link";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, hasConsent } from "../lib/profile";

/**
 * The public front door: what the practice is (realistic development problems, solved without
 * AI), the one loop every issue follows, and what is recorded. Outside the consent gate;
 * returning players get a way back to their desk.
 */

/** The loop every issue follows, as it actually goes in the workspace. */
const LOOP = [
  [
    "01",
    "Issue",
    "A bug report or feature request, with the repo it lives in.",
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
            Realistic development problems.
            <br />
            <span className="home-punch">Solved by you.</span>
          </h1>
          <p className="home-lede">
            Read the issue, change the code, run the tests and open a pull
            request. CI checks it, review may ask for changes, and you merge.
            Completion, chat and generated code are off.
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
            The actual workspace, before any edits: issue, code and tests
            together. Your solution is yours to write.
          </figcaption>
        </figure>

        <section className="home-section">
          <h2>One loop, every issue</h2>
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
          <p className="home-fine">
            Python, JavaScript, TypeScript, SQL, HTML, PHP, Ruby, Go, C, C++, C#
            and Java, running in your browser. Syntax highlighting, type errors
            and hover types are on. Completion, chat and generated code are off.
          </p>
        </section>

        <section className="home-section">
          <h2>What you get</h2>
          <ul className="home-promises">
            <li>
              <strong>Problems that read like work.</strong> Issues written the
              way a teammate would file them, and tests that check behaviour
              rather than one expected answer.
            </li>
            <li>
              <strong>Your own record.</strong> Every run, push and merged fix
              stays reviewable. No scores, ranks or badges, and nothing here is
              a hiring signal.
            </li>
          </ul>
        </section>

        <section className="home-section">
          <h2>Why it records your practice</h2>
          <p>
            What AI tools do for developers&apos; skills, good or bad, is still
            an open question. Unaided practice is what we record, to help study
            it; it is not a verdict on you or on AI, so use whatever tools you
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
          <h2>Pick an issue.</h2>
          <p>
            It&apos;s an early preview, and the issues are still growing toward
            the messy, multi-file work of a real job.
          </p>
          <div className="home-actions">
            {start}
            <Link className="home-note" href="/issues">
              Browse every issue instead
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
