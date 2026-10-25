import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { languageLabel } from "../../lib/library";
import { getLibrary } from "../../lib/load";
import { hasConsent, CONSENT_COOKIE } from "../../lib/profile";
import { PlayStart } from "./play-start";

export const metadata: Metadata = {
  title: "The five-minute test · Muscle Memory",
  description:
    "One small bug in a real codebase, in your language. No AI, no autocomplete. Practice at your pace.",
};

type Props = { searchParams: Promise<{ ref?: string; lang?: string }> };

/**
 * The five-minute test: where shared links land. One small bug in the language you pick, with
 * nothing to fill in first: starting accepts the Terms, and the setup questions wait until
 * someone joins the platform.
 */
export default async function Play({ searchParams }: Props) {
  const { ref, lang } = await searchParams;
  const store = await cookies();
  const consented = hasConsent(store.get(CONSENT_COOKIE)?.value);
  const { findProject } = await getLibrary();
  const quick = findProject("QUICK");
  const choices = (quick?.issues ?? []).map((issue) => ({
    key: issue.key,
    slug: issue.slug,
    revision: issue.revision,
    language: issue.language ?? "",
    label: issue.language ? languageLabel(issue.language) : issue.key,
  }));
  return (
    <div className="legal home play">
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
        </nav>
      </header>
      <main className="legal-body home-body">
        <section className="home-hero">
          <p className="home-kicker">The five-minute test</p>
          <h1>
            One bug. No AI.
            <br />
            <span className="home-punch">Practice at your pace.</span>
          </h1>
          <p className="home-lede">
            Read the ticket, fix the bug, run tests and merge your pull request.
            Syntax highlighting is on; AI and autocomplete are off. About five
            minutes, with no timer.
          </p>
        </section>
        <section className="play-ticket" aria-label="The ticket">
          <p className="play-ticket-head">
            <span className="mono">QUICK</span> · Bug · from Lena M, Product
          </p>
          <p className="play-ticket-title">
            The composer says 1 word when the post is empty
          </p>
          <p className="play-ticket-body">
            Writers keep emailing support: an empty post says{" "}
            <strong>1 word</strong>, and a post with a double space counts an
            extra one.
          </p>
        </section>
        <PlayStart
          choices={choices}
          consented={consented}
          referral={ref ?? null}
          preferred={lang ?? null}
        />
      </main>
    </div>
  );
}
