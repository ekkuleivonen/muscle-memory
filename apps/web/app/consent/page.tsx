import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE, hasConsent, safeNext } from "../../lib/profile";
import { ConsentButton } from "./consent-button";
import { ConsentPoints } from "./consent-points";

export const metadata: Metadata = { title: "Before you go in · Muscle Memory" };

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * The one thing every page needs: the current Terms accepted. Plain, one click, then on to
 * the page someone was heading for. The setup questions are not asked here.
 */
export default async function Consent({ searchParams }: Props) {
  const next = safeNext((await searchParams).next, "/challenges");
  const store = await cookies();
  if (hasConsent(store.get(CONSENT_COOKIE)?.value)) redirect(next);
  return (
    <div className="legal home">
      <header className="legal-head">
        <Link href="/" className="site-name">
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
        <ConsentPoints />
        <ConsentButton next={next} />
      </main>
    </div>
  );
}
