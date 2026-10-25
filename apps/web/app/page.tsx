import type { Metadata } from "next";
import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, pageMetadata } from "../lib/site";
import { Banner } from "./_terminal/banner";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

export const metadata: Metadata = pageMetadata({
  title: `${SITE_NAME}: practice coding without AI`,
  absolute: true,
  description: SITE_DESCRIPTION,
  path: "/",
});

/** What search engines read about the site as a whole. */
const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
};

/**
 * The public front door, in one screen: the question, a challenge to start, and the story
 * behind it on the manifesto. Outside the consent gate; the challenge to start is quick
 * start's, an easy one in your language.
 */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE) }}
      />
      <div className="term home">
        {/* The question is this page's heading, not the wordmark. */}
        <Banner description="Keep your craft." heading={false} />
        <main className="t-prose home-fold">
          <h1 className="t-line home-headline">
            <strong>You can ship with AI.</strong>
            <br />
            <strong className="t-brand">Can you still code without it?</strong>
          </h1>
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
            I use AI for almost everything, and I enjoy what it lets me build.
            Writing some code on my own caught me off guard. I want to keep
            being able to do both. That&apos;s why I built Muscle Memory, and
            why I&apos;m curious how it feels for you.{" "}
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
