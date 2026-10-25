"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorkspaceRecord } from "../../../../../packages/domain/workspace";
import { attemptAt } from "../../../lib/attempts";
import {
  INCIDENT,
  attemptLabel,
  incidentState,
  shortVersion,
} from "../../../lib/incident";
import { logDeploy } from "./board-log";

/** The rollout, in order. Each step's text says what it is based on. */
function steps(number: number, version: string, passed: number, total: number) {
  return [
    {
      title: "Build",
      detail: `Built from pull request #${number}, incident version ${version}.`,
    },
    {
      title: "Checks",
      detail: `${passed} of ${total} CI checks passed on exactly this code, the regression order #88213 among them.`,
    },
    {
      title: "Canary, 5% of traffic",
      detail: "Guest quotes come back with shipping. Nobody's mugs are free.",
    },
    {
      title: "Rollout, 100%",
      detail: "checkout-api 5xx rate back under the 2% threshold.",
    },
  ];
}

/**
 * The simulated deploy of a merged incident fix: the step after merging, and what the incident
 * report requires. Only the current attempt's merged pull request, whose merged push passed
 * every check, can be deployed; pressing Deploy is recorded, and nothing is deployed anywhere.
 */
export function IncidentDeploy({
  issue,
  number,
  openedAt,
  records,
  onDeployed,
}: {
  issue: { key: string; slug: string };
  number: number;
  /** When the pull request was opened: which attempt it belongs to. */
  openedAt: string;
  records: readonly WorkspaceRecord[];
  /** Read the records again once the deploy is stored. */
  onDeployed: () => void;
}) {
  const state = incidentState(records);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deployed = state.deployed?.number === number;
  const merged = state.merged?.number === number ? state.merged : null;
  const plan = merged
    ? steps(number, shortVersion(merged.revision), merged.passed, merged.total)
    : [];
  // Steps reveal one by one after pressing Deploy; a deploy already recorded shows them all.
  useEffect(() => {
    if (!deployed || shown >= plan.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), busy ? 700 : 0);
    return () => clearTimeout(timer);
  }, [deployed, shown, plan.length, busy]);

  // Merged a moment ago in this attempt: the merge is still being stored.
  if (
    !merged &&
    attemptAt(records, INCIDENT.slug, openedAt).number === state.attempt.number
  )
    return (
      <section className="incident-deploy" aria-live="polite">
        <p className="loading-state">Recording the merge…</p>
      </section>
    );
  if (!merged)
    return (
      <section className="incident-deploy">
        <h2>Not the fix being deployed</h2>
        <p>
          Pull request #{number} belongs to an earlier response. The current{" "}
          {attemptLabel(state.attempt.number).toLowerCase()} needs its own
          merged fix before anything ships.{" "}
          <Link href={`/work/${issue.key}`}>Back to the incident</Link>
        </p>
      </section>
    );

  const deploy = async (via: "pointer" | "keyboard") => {
    setBusy(true);
    setError("");
    const stored = await logDeploy(
      { id: issue.slug, revision: merged.revision },
      { issueKey: issue.key, pullRequest: number, runId: merged.runId, via },
    );
    if (!stored) {
      setBusy(false);
      setError(
        "The deploy could not be recorded in this browser, so it didn't happen. Allow browser storage and try again.",
      );
      return;
    }
    onDeployed();
  };
  const finished = deployed && shown >= plan.length;
  return (
    <section className="incident-deploy" aria-live="polite">
      <h2>
        {finished ? "Checkout is back." : "Merged. Production is still down."}
      </h2>
      {!deployed && (
        <>
          <p>
            The fix is on main, but customers still get the old code until it
            ships. This deploy is simulated: nothing leaves your browser.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            className="merge-button"
            disabled={busy}
            onClick={(event) =>
              void deploy(event.detail === 0 ? "keyboard" : "pointer")
            }
          >
            {busy ? "Deploying…" : "Deploy to production"}
          </button>
        </>
      )}
      {deployed && (
        <ol className="incident-steps">
          {plan.slice(0, Math.max(shown, 0)).map((step) => (
            <li key={step.title}>
              <span className="incident-step-mark" aria-hidden>
                ✔
              </span>
              <b>{step.title}.</b> {step.detail}
            </li>
          ))}
        </ol>
      )}
      {finished && (
        <>
          <div className="incident-chat">
            <p>
              <b>Bea L</b> <span className="faint">Support</span> Telling the
              212 people in the queue now. Someone already replied &ldquo;MY
              MUGS!!&rdquo; but happier.
            </p>
            <p>
              <b>Noor A</b> <span className="faint">Incident commander</span>{" "}
              Marking it resolved on the status page. By hand. Slowly. Savouring
              it.
            </p>
          </div>
          <Link className="home-cta" href="/incident/report">
            File the incident report →
          </Link>
        </>
      )}
    </section>
  );
}
