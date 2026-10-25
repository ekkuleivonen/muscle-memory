"use client";
import Link from "next/link";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { attemptAt } from "../../../lib/attempts";
import { attemptLabel, INCIDENT, incidentState } from "../../../lib/incident";

/**
 * What merging the incident's fix did: in the story main ships itself, so the merge resolves
 * the incident. Nothing beyond the merge is recorded, and no deploy is asked of the person.
 */
export function IncidentResolved({
  number,
  openedAt,
  records,
}: {
  number: number;
  /** When the pull request was opened: which attempt it belongs to. */
  openedAt: string;
  records: readonly WorkspaceRecord[];
}) {
  const state = incidentState(records);
  const merged = state.merged?.number === number ? state.merged : null;
  // Merged a moment ago in this attempt: the merge is still being stored.
  if (
    !merged &&
    attemptAt(records, INCIDENT.slug, openedAt).number === state.attempt.number
  )
    return (
      <section className="incident-resolved" aria-live="polite">
        <p className="loading-state">Recording the merge…</p>
      </section>
    );
  if (!merged)
    return (
      <section className="incident-resolved">
        <h2>An earlier response</h2>
        <p>
          Pull request #{number} belongs to an earlier response. The current{" "}
          {attemptLabel(state.attempt.number).toLowerCase()} needs its own
          merged fix.{" "}
          <Link href={`/work/${INCIDENT.key}`}>Back to the incident</Link>
        </p>
      </section>
    );
  return (
    <section className="incident-resolved" aria-live="polite">
      <h2>Checkout is back.</h2>
      <p>
        Pull request #{number} passed {merged.passed} of {merged.total} checks
        and is merged; main ships itself, so guest quotes come back with
        shipping. (Kettlebrook and its production are fictional: nothing real is
        deployed.)
      </p>
      <Link className="home-cta" href="/incident/report">
        File the incident report →
      </Link>
    </section>
  );
}
