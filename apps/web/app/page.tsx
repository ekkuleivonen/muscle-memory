import type { Metadata } from "next";
import Link from "next/link";
import { Banner } from "./_terminal/banner";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

export const metadata: Metadata = {
  title: "Muscle Memory",
  description:
    "You can ship with AI. Can you still code without it? Pick a challenge, write the solution yourself, and see what comes back naturally.",
};

/**
 * The public front door, in one screen: the question, a challenge to start, and the story
 * behind it on the manifesto. Outside the consent gate; the challenge to start is quick
 * start's, an easy one in your language.
 */
export default function Home() {
  return (
    <>
      <div className="term home">
        <Banner description="Practice without AI." />
        <main className="t-prose home-fold">
          <p className="t-line home-headline">
            <strong>You can ship with AI.</strong>
            <br />
            <strong className="t-brand">Can you still code without it?</strong>
          </p>
          <p className="t-line">
            Pick a challenge. Write the solution yourself. See what comes back
            naturally, and what doesn&apos;t.
          </p>
          <div className="home-start">
            <Link className="t-btn t-btn-primary" href="/start" autoFocus>
              try your first challenge →
            </Link>
            <Link className="t-cmd" href="/challenges">
              explore all challenges
            </Link>
          </div>
          <p className="t-line t-dim home-teaser">
            I use AI for almost everything. Then I tried writing some code on
            my own, and it caught me completely off guard. I built Muscle
            Memory to find out whether others feel the same, and to put some
            data behind the debate.{" "}
            <Link className="t-cmd" href="/manifesto">
              Why I built this →
            </Link>
          </p>
        </main>
      </div>
      <TermFooter />
    </>
  );
}
