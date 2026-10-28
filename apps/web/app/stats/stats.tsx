"use client";
import { reportProfile } from "../../lib/profile";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { buildReport, mergeEvidence, type Report } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import { useReportData, type HistoryStatus } from "./report-data";
import { QuestionView } from "./report-view";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";

const NONE: AttemptSummary[] = [];

/** Stealth is the deal: no report at all, only what stealth means and where to change it. */
export function StealthNotice() {
  return (
    <section className="report-quiet" aria-labelledby="stealth-title">
      <h1 id="stealth-title" className="report-headline">
        You&apos;re in stealth, so there&apos;s no report here.
      </h1>
      <p>
        Stealth leaves you out of comparisons and published insights. In
        return, this page shows no stats: not your own, not other
        people&apos;s, not the models&apos;. Practice works as usual, and
        recording continues as the Privacy Notice describes.
      </p>
      <p>
        <Link className="t-cmd" href="/settings/privacy">
          Privacy settings →
        </Link>
      </p>
    </section>
  );
}

/** Only what changes how to read the page: earlier practice still arriving, or not added. */
export function Status({ history, onRetry }: { history: HistoryStatus; onRetry?: () => void }) {
  const failed = history.state === "unavailable" || history.state === "limited" || (history.state === "ready" && Boolean(history.reason));
  const waiting = "retryAt" in history && Boolean(history.retryAt);
  const text =
    history.state === "loading" || history.state === "idle"
      ? "Adding your earlier practice…"
      : failed && waiting
        ? "Your earlier practice couldn't be added yet; trying again shortly."
        : history.state === "ready"
          ? history.notice ?? (history.value.next ? "Earlier practice is still being added…" : history.value.unavailable.length ? "Some earlier practice could not be added." : null)
          : failed
            ? "Your earlier practice couldn't be added right now; this shows this device only."
            : null;
  return text ? (
    // The reason is a fixed code for support, kept out of the copy.
    <p className="report-status" role="status" data-history-reason={"reason" in history ? history.reason : undefined}>
      {text}
      {failed && !waiting && onRetry ? (
        <>
          {" "}
          <button type="button" className="t-cmd" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : null}
    </p>
  ) : null;
}

export function ReportBody({
  report,
  status,
}: {
  report: Report;
  status: React.ReactNode;
}) {
  const next = report.next && (
    <p>
      <Link className="report-action" href={report.next.href}>
        {report.next.label} →
      </Link>
    </p>
  );
  if (report.empty)
    return (
      <section className="report-hero" aria-labelledby="report-title">
        <h1 id="report-title" className="t-doc-title">
          Your portrait starts with one challenge.
        </h1>
        {next}
        {status}
      </section>
    );
  return (
    <>
      <header className="report-hero">
        <h1 className="t-doc-title">How you code</h1>
        {status}
        {report.waiting && <p className="report-context">{report.waiting}</p>}
        {report.waiting && next}
      </header>
      {report.questions.map((q) => (
        <QuestionView key={q.id} q={q} />
      ))}
      {report.previews.map((preview) => (
        <section className="report-preview t-md" key={preview.action.href}>
          <h3>{preview.question}</h3>
          <Link className="t-cmd" href={preview.action.href}>
            {preview.action.label} →
          </Link>
        </section>
      ))}
      {!report.waiting && next}
      {report.profile && (
        <p className="report-note">
          <Link className="t-cmd" href={report.profile.href}>
            {report.profile.label}
          </Link>
        </p>
      )}
    </>
  );
}

export function Dashboard({ catalog }: { catalog: ChallengeSummary[] }) {
  // The report picks the revisions for the model FYI; the data hook reads them. Kept in state to break the cycle.
  const [wanted, setWanted] = useState<Report["comparisonRevisions"]>([]);
  const { privacy, local, history, receipts, retryHistory } = useReportData(wanted);
  const device = local.value;
  const uploaded = history.state === "ready" ? history.value.attempts : NONE;
  const attempts = useMemo(
    () => (device ? mergeEvidence(device.attempts, uploaded) : []),
    [device, uploaded],
  );
  const report = useMemo(
    () =>
      device
        ? buildReport({
            catalog,
            progress: device.progress,
            attempts,
            profile: reportProfile(device.profile),
            receipts,
          })
        : null,
    [catalog, device, attempts, receipts],
  );
  const key = report?.comparisonRevisions.map((r) => r.revision).join("|") ?? "";
  if (key !== wanted.map((r) => r.revision).join("|"))
    setWanted(report?.comparisonRevisions ?? []);
  return (
    <main className="term stats">
      <div className="stats-content">
        {privacy === "stealth" ? (
          <StealthNotice />
        ) : privacy === "signed-out" ? (
          <section className="report-quiet">
            <h1 className="report-headline">Your report needs your account on this browser.</h1>
            <p>
              <Link className="t-cmd" href="/consent?next=/stats">
                Sign in again →
              </Link>
            </p>
          </section>
        ) : privacy === "error" || (local.error && !report) ? (
          <section className="report-quiet">
            <h1 className="report-headline">Your practice couldn&apos;t be read on this browser.</h1>
            <p className="t-dim">
              Storage may be blocked or full. Nothing was changed; reload the page to try again.
            </p>
          </section>
        ) : !report ? (
          <p className="report-status" role="status">
            Reading your practice…
          </p>
        ) : (
          <>
            <ReportBody
              report={report}
              status={<Status history={history} onRetry={retryHistory} />}
            />
            {local.error && <p role="status" className="t-dim">Some saved practice couldn&apos;t be read.</p>}
            <p className="report-footer">
              <Link className="t-cmd" href="/privacy">
                How your data is used
              </Link>{" "}
              ·{" "}
              <Link className="t-cmd" href="/settings">
                Your data settings
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
