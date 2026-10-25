import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE, hasConsent, safeNext } from "../../lib/profile";
import { ConsentButton } from "./consent-button";

export const metadata: Metadata = { title: "Before you go in · Muscle Memory" };

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * The one thing every page needs: the current Terms accepted. Plain, one click, then on to
 * the page someone was heading for. The setup questions are not asked here.
 */
export default async function Consent({ searchParams }: Props) {
  const next = safeNext((await searchParams).next, "/dashboard");
  const store = await cookies();
  if (hasConsent(store.get(CONSENT_COOKIE)?.value)) redirect(next);
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
      </header>
      <main className="legal-body home-body">
        <section className="home-hero">
          <p className="home-kicker">Before you go in</p>
          <h1>One thing first.</h1>
        </section>
        <ul className="home-promises consent-points">
          <li>
            <strong>We record what you do here, keystroke by keystroke:</strong>{" "}
            every key you press in the editor and when, your edits and pastes,
            the pages and files you open, test runs and their output, and when
            you switch away (never to what). It&apos;s sent to our servers
            without your name. That&apos;s the product.
          </li>
          <li>
            <strong>We may publish anonymised stats and datasets.</strong>{" "}
            Rather not? Go stealth any time in settings.
          </li>
          <li>
            <strong>Nobody sees your results next to your handle,</strong> and
            we don&apos;t sell your personal data.
          </li>
          <li>
            <strong>Code you write stays yours;</strong> you give us a licence
            to use and publish it.
          </li>
        </ul>
        <p className="home-fine">
          The full <Link href="/terms">Terms</Link> and{" "}
          <Link href="/privacy">Privacy Notice</Link> are short and written for
          humans.
        </p>
        <p className="home-fine">
          Your random handle, code and progress are saved in this browser. There
          is no device sync or recovery from uploads. Logging out keeps your
          local data; clearing browser storage does not.
        </p>
        <ConsentButton next={next} />
      </main>
    </div>
  );
}
