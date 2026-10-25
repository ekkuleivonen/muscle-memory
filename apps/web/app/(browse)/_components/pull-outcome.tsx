"use client";
import { useMemo } from "react";
import type { Revision } from "../../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { briefOf } from "../../../lib/brief";
import {
  evidenceOf,
  type Evidence,
  type EvidenceItem,
  type MergeBlocker,
} from "../../../lib/evidence";

const STATUS: Record<EvidenceItem["status"], string> = {
  observed: "Observed",
  missing: "Not known",
  inferred: "Reading",
};

/**
 * One pull request's outcome, from what its page already holds: shown at once when merged.
 * Renders nothing while open or closed, or while records are loading.
 */
export function PullOutcome({
  records,
  issue,
  number,
  revisions,
  mergedAt,
  blocker,
}: {
  /** The pull request's attempt (lib/attempts), or null while loading. */
  records: readonly WorkspaceRecord[] | null;
  issue: { slug: string };
  number: number;
  revisions: Record<string, Revision>;
  /** When it was merged, including a moment ago on this page before the records catch up. */
  mergedAt?: string | null;
  /**
   * The merge gate's verdict (`eligibility.blocker`, lib/merge.ts), passed on to the evidence.
   * Leave it out when not known; then stale checks are never claimed.
   */
  blocker?: MergeBlocker | null;
  /** Unused since open pull requests show no outcome; kept so callers need no change. */
  ideHref?: string;
}) {
  const evidence = useMemo(() => {
    if (!records) return null;
    const read = evidenceOf({
      records,
      issue: issue.slug,
      number,
      revisionFor: (id) => revisions[id],
      blocker,
      until: mergedAt ?? new Date().toISOString(),
    });
    // Merged on this page a moment ago, before the stored records are read again.
    return read && mergedAt && read.facts.state === "open"
      ? {
          ...read,
          facts: { ...read.facts, state: "merged" as const },
          actions: [],
        }
      : read;
  }, [records, issue.slug, number, revisions, mergedAt, blocker]);
  return evidence && <OutcomeView evidence={evidence} />;
}

/**
 * A merged pull request's outcome on its own page: the result against the first submission and
 * a few lines first (lib/brief.ts), the full evidence one click away, each line marked observed,
 * not known or a limited reading. Nothing for an open pull request: the merge box is the one
 * place that says what is left before merging, and Findings lists what to fix. Embeddable
 * anywhere a pull request's evidence is at hand (lib/evidence.ts); it holds no state and records
 * nothing.
 */
export function OutcomeView({
  evidence,
}: {
  evidence: Evidence;
  /** Unused since the merge box says what to do on an open pull request; kept for callers. */
  ideHref?: string;
}) {
  const brief = briefOf(evidence.facts);
  if (!brief) return null;
  return (
    <section className="outcome" aria-labelledby="outcome-title">
      <h2 id="outcome-title">Outcome</h2>
      <p className={`outcome-headline${brief.firstMissing ? " missing" : ""}`}>
        {brief.headline}
      </p>
      <Lines items={brief.items} />
      <details className="outcome-details">
        <summary>All evidence</summary>
        <p className="outcome-note dim">
          Each line is <b>observed</b>, <b>not known</b>, or a limited{" "}
          <b>reading</b> of what was observed.
        </p>
        {evidence.sections.map((section) => (
          <div
            key={section.id}
            className={`outcome-section ${section.id === "timing" ? "secondary" : ""}`}
          >
            <h3>{section.title}</h3>
            <Lines items={section.items} />
          </div>
        ))}
      </details>
    </section>
  );
}

function Lines({ items }: { items: readonly EvidenceItem[] }) {
  return (
    <ul className="outcome-lines">
      {items.map((item) => (
        <li key={item.id} className={`${item.status} ${item.tone}`}>
          <span className="outcome-status">{STATUS[item.status]}</span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
