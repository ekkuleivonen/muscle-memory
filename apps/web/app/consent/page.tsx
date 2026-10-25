import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CONSENT_COOKIE, hasConsent, safeNext } from "../../lib/profile";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { ConsentButton } from "./consent-button";
import { ConsentPoints } from "./consent-points";

export const metadata: Metadata = { title: "Before you go in · Muscle Memory" };

type Props = { searchParams: Promise<{ next?: string }> };

/**
 * The one thing every page needs: the current Terms accepted. Plain, one key or click, then on
 * to the page someone was heading for. The setup questions are not asked here.
 */
export default async function Consent({ searchParams }: Props) {
  const next = safeNext((await searchParams).next, "/challenges");
  const store = await cookies();
  if (hasConsent(store.get(CONSENT_COOKIE)?.value)) redirect(next);
  return (
    <>
      <div className="term">
        <main className="t-prose t-consent">
          <p className="t-line t-dim">
            <span className="t-ok">~</span> <span className="t-accent">$</span>{" "}
            open {next}
          </p>
          <h1 className="t-doc-title">One thing first.</h1>
          <ConsentPoints />
          <ConsentButton next={next} />
        </main>
      </div>
      <TermFooter trail={[{ label: "before you go in", href: "" }]} />
    </>
  );
}
