import type { Metadata } from "next";
import Link from "next/link";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";

export const metadata: Metadata = {
  title: "Manifesto · Muscle Memory",
  description:
    "Why Muscle Memory exists: unaided practice, recorded in the open, never a verdict on you or on AI.",
};

/**
 * The idea and the vision, at more length than the home page has room for: the loop every
 * challenge follows, and why practice is recorded. Public, like the home page.
 */
export default function ManifestoPage() {
  return (
    <>
      <div className="term">
        <main className="t-prose">
          <h1 className="t-doc-title">Manifesto</h1>
          <div className="markdown t-md">
            <h3>Challenge, code, feedback</h3>
            <p>
              A check fails. You form a hunch, try it and look again. There is a
              particular satisfaction in seeing why it failed, changing the code
              and watching it pass.
            </p>
            <ol>
              <li>
                <strong>Challenge.</strong> A bug to fix, something to build or
                an algorithm to write, with a plain goal.
              </li>
              <li>
                <strong>Code.</strong> Write the solution yourself.
              </li>
              <li>
                <strong>Feedback.</strong> Run checks, understand what needs
                attention, and try again. When it passes, choose your next
                challenge.
              </li>
            </ol>
            <p>
              Afterwards you have a record of these attempts, not a verdict on
              your ability or a hiring assessment.
            </p>
            <p>
              Python, JavaScript, TypeScript, SQL, HTML, PHP, Ruby, Go, C, C++,
              C# and Java, running in your browser. Syntax highlighting, type
              errors and hover types are on. Completion, chat and generated code
              are off.
            </p>

            <h3>Why it records your practice</h3>
            <p>
              This isn&apos;t a case for going back to coding without AI. It is
              part of how software gets built now, and nothing here asks you to
              give it up. What it changes about how developers work and
              understand their code, good or bad, is still an open question.
              Unaided practice is what we record, to help study it in the open;
              it is not a verdict on you or on AI.
            </p>
            <ul>
              <li>
                <strong>Raw data and interpretation are kept apart.</strong> We
                record what happened (keystrokes, runs, results) and version
                every assessment we draw from it. We plan to publish research
                methods and null results too.
              </li>
              <li>
                <strong>Signals are footnotes, not accusations.</strong> Where
                we record signals like pasting or leaving the tab, they only
                tell us how much salt to apply to the data. Nobody polices you.
              </li>
              <li>
                <strong>Anonymous, with a way out.</strong> Future published
                data will be anonymised. Go stealth to keep your results out of
                published stats, or delete everything, any time. See the{" "}
                <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy">Privacy Notice</Link>.
              </li>
            </ul>

            <h3>This one&apos;s yours.</h3>
            <p>
              Pick a challenge and write it yourself. It&apos;s an early
              preview, with more challenges to come.{" "}
              <Link href="/play">Try a challenge →</Link>
            </p>
          </div>
        </main>
      </div>
      <TermFooter trail={[{ label: "manifesto", href: "/manifesto" }]} />
    </>
  );
}
