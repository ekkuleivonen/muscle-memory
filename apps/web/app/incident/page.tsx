import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ConsentPoints } from "../consent/consent-points";
import { INCIDENT, resolveVersion, shortVersion } from "../../lib/incident";
import { getLibrary } from "../../lib/load";
import { CONSENT_COOKIE, hasConsent } from "../../lib/profile";
import { IncidentStart } from "./incident-start";

export const metadata: Metadata = {
  title: "Production is down. AI is down. You're on call. · Muscle Memory",
  description:
    "A fictional shop's checkout is failing at 2am and the team's AI tools are down too. Read the logs, fix it, ship it. Five to ten minutes.",
};

type Props = { searchParams: Promise<{ ref?: string; v?: string }> };

/**
 * The incident's front door, where the home page and shared reports lead: the page that woke
 * you, what happens next, and the Terms, accepted explicitly. A shared link's version (`v`)
 * is played exactly; one that names no published version says so instead of swapping in the
 * latest.
 */
export default async function IncidentPage({ searchParams }: Props) {
  const { ref, v } = await searchParams;
  const store = await cookies();
  const consented = hasConsent(store.get(CONSENT_COOKIE)?.value);
  const { findIssue, revisionsOf } = await getLibrary();
  const issue = findIssue(INCIDENT.key);
  if (!issue) notFound();
  const published = Object.keys(revisionsOf(issue.slug));
  const linked = v ? resolveVersion(published, v) : null;
  return (
    <div className="legal home play incident">
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
          <p className="home-kicker">
            Incident {issue.key} · version{" "}
            {shortVersion(linked ?? issue.revision)}
          </p>
          <h1>
            Production is down. AI is down.
            <br />
            <span className="home-punch">You&apos;re on call.</span>
          </h1>
        </section>
        <section className="incident-page" aria-label="The page">
          <p className="incident-page-head">
            <span className="incident-sev">SEV-1</span> 02:14 · checkout-api ·
            Kettlebrook
          </p>
          <p className="incident-page-title">
            5xx rate 58% (threshold 2%) for 9 minutes. <code>POST /quote</code>{" "}
            is failing.
          </p>
          <p className="incident-page-body">
            Kettlebrook, a homeware shop, does most of its engineering with AI
            tools. Tonight the coding assistant, the log summariser and the bot
            that writes status updates are all down, and so is checkout. You
            have the logs, the code, a failing regression test and a team chat.
          </p>
        </section>
        <ol className="incident-plan">
          <li>Read the production log and find the line that breaks.</li>
          <li>Run the failing regression test.</li>
          <li>Fix it in the IDE, open a pull request, get CI green, merge.</li>
          <li>Merged means fixed: main ships itself. Then file the report.</li>
        </ol>
        <p className="home-fine">
          A fictional company, a real bug, about five to ten minutes, no timer.
          Syntax highlighting and type hints are on; completion, chat and
          generated code are off.
        </p>
        <IncidentStart
          issue={{ key: issue.key, slug: issue.slug }}
          live={issue.revision}
          linked={linked}
          unknownVersion={v && !linked ? v.slice(0, 64) : null}
          consented={consented}
          referral={ref ?? null}
          disclosure={<ConsentPoints />}
        />
      </main>
    </div>
  );
}
