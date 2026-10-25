"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { Revision } from "../../../../../packages/content/model";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
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
 * One pull request's outcome, from what its page already holds: shown at once when merged, and
 * what to do first while open. Renders nothing for a closed one or while records are loading.
 */
export function PullOutcome({
  records,
  issue,
  number,
  revisions,
  mergedAt,
  blocker,
  ideHref,
}: {
  /** The pull request's attempt (lib/attempts), or null while loading. */
  records: readonly WorkspaceRecord[] | null;
  issue: { slug: string };
  number: number;
  revisions: Record<string, Revision>;
  /** When it was merged, including a moment ago on this page before the records catch up. */
  mergedAt?: string | null;
  /**
   * The merge gate's verdict (`eligibility.blocker`, lib/merge.ts): what Before merging lists.
   * Leave it out when not known; then stale checks are never claimed.
   */
  blocker?: MergeBlocker | null;
  ideHref: string;
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
  return evidence && <OutcomeView evidence={evidence} ideHref={ideHref} />;
}

/**
 * A pull request's outcome on its own page, with no extra step: once merged, what changed and
 * what the evidence shows, each line marked observed, not known or a limited reading; while open,
 * what stands between it and merging. Embeddable anywhere a pull request's evidence is at hand
 * (lib/evidence.ts); it holds no state and records nothing.
 */
export function OutcomeView({
  evidence,
  ideHref,
}: {
  evidence: Evidence;
  /** The IDE on this issue, where failing or stale checks are fixed. */
  ideHref: string;
}) {
  const { facts, sections, actions } = evidence;
  if (facts.state === "open")
    return actions.length ? (
      <section
        className="outcome-actions"
        aria-labelledby="outcome-actions-title"
      >
        <h2 id="outcome-actions-title">Before merging</h2>
        <ul>
          {actions.map((action) => (
            <li key={action.id}>
              {action.text}{" "}
              {action.where === "ide" ? (
                <Link href={ideHref}>Open the IDE →</Link>
              ) : action.where === "findings" ? (
                <a href="#pull-findings-title">Go to Findings ↓</a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  if (facts.state !== "merged") return null;
  return (
    <section className="outcome" aria-labelledby="outcome-title">
      <h2 id="outcome-title">Outcome</h2>
      <p className="outcome-note dim">
        From this pull request&apos;s history. Each line says whether it was{" "}
        <b>observed</b>, is <b>not known</b>, or is a limited <b>reading</b> of
        what was observed.
      </p>
      {sections.map((section) => (
        <div
          key={section.id}
          className={`outcome-section ${section.id === "timing" ? "secondary" : ""}`}
        >
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item.id} className={`${item.status} ${item.tone}`}>
                <span className="outcome-status">{STATUS[item.status]}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
