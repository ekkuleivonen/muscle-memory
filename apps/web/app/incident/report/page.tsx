import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { INCIDENT } from "../../../lib/incident";
import { getLibrary } from "../../../lib/load";
import { IncidentReport } from "./incident-report";

export const metadata: Metadata = {
  title: "Incident report · INC-1 · Muscle Memory",
};

/**
 * The incident report: filed only for an attempt whose fix was merged with every check passing
 * and then deployed, read from this browser's records of that attempt.
 */
export default async function ReportPage() {
  await requireConsent("/incident/report");
  const { findIssue, revisionsOf } = await getLibrary();
  const issue = findIssue(INCIDENT.key);
  if (!issue) notFound();
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
          <Link href="/dashboard">Your desk</Link>
        </nav>
      </header>
      <main className="legal-body home-body">
        <IncidentReport
          issue={{ key: issue.key, slug: issue.slug }}
          revisionsJson={JSON.stringify(revisionsOf(issue.slug))}
        />
      </main>
    </div>
  );
}
