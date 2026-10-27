"use client";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { buildReport, mergeEvidence, type Report } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import { useReportData, type HistoryStatus } from "./report-data";
import { ChapterNav, ChapterView, Preview } from "./report-view";
import { Measurements } from "./appendix";
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

function Freshness({
  history,
  at,
  more,
}: {
  history: HistoryStatus;
  at: string | null;
  more: () => void;
}) {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <p className="report-status" role="status">
      <span>
        From this device{at ? `, read ${time(at)}` : ""}.{" "}
        {history.state === "ready"
          ? history.value.attempts.length
            ? `Plus ${history.value.attempts.length} uploaded attempts, as of ${time(history.value.readAt)}.`
            : `No uploads in the past year (checked ${time(history.value.readAt)}).`
          : history.state === "loading" || history.state === "idle"
            ? "Adding your uploads…"
            : history.message}
        {history.state === "ready" && history.notice ? ` ${history.notice}` : ""}
      </span>
      {history.state === "ready" && history.value.next && (
        <button type="button" className="t-cmd" onClick={more}>
          read more uploads
        </button>
      )}
    </p>
  );
}

export function ReportBody({
  report,
  status,
}: {
  report: Report;
  status: React.ReactNode;
}) {
  if (report.empty) {
    const next = report.chapters[0];
    return (
      <>
        <section className="report-hero" aria-labelledby="report-title">
          <p className="t-brand">muscle memory / your report</p>
          <h1 id="report-title" className="report-headline is-lead">
            Your report starts with one challenge.
          </h1>
          <p className="report-context">
            Solve something without AI and this page tells the story: what you
            finished, how the attempt unfolded, and how models did on the same
            task.
          </p>
          {next.id === "next" && next.action && (
            <p>
              <Link className="report-action" href={next.action.href}>
                {next.action.label} →
              </Link>
            </p>
          )}
          {status}
        </section>
        <Preview />
      </>
    );
  }
  const count = report.chapters.length;
  return (
    <>
      <header className="report-hero">
        <h1 className="t-brand report-brand">muscle memory / your report</h1>
        {status}
      </header>
      <ChapterNav chapters={report.chapters} />
      {report.chapters.map((c, i) => (
        <ChapterView key={c.id} chapter={c} index={i} count={count} report={report} />
      ))}
      {!report.chapters.some((c) => c.id === "story") && <Preview />}
    </>
  );
}

export function Dashboard({ catalog }: { catalog: ChallengeSummary[] }) {
  // Chapter 4 picks the revisions; the data hook reads their receipts. Kept in state to break the cycle.
  const [wanted, setWanted] = useState<Report["comparisonRevisions"]>([]);
  const { privacy, local, history, receipts, more } = useReportData(wanted);
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
            profile: device.profile.profile,
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
        ) : privacy === "error" || local.error ? (
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
              status={<Freshness history={history} at={device!.at} more={more} />}
            />
            {!report.empty && (
              <Measurements
                attempts={attempts}
                catalog={catalog}
                until={history.state === "ready" ? history.value.readAt : device!.at}
              />
            )}
            <details className="report-appendix" id="about">
              <summary>
                About this report <span className="t-dim">/ sources, limits and privacy</span>
              </summary>
              <p>
                It reads this device&apos;s practice and, automatically, code-free
                summaries of what this browser uploaded in the past year. Your
                browser&apos;s private secret proves the uploads are yours; nobody
                else&apos;s activity is read. Summaries stay in this page&apos;s
                memory while the report is open and for at most five minutes
                after, and are never saved or restored into your progress.
              </p>
              <p>
                Each upload read covers up to five attempts; &quot;read more
                uploads&quot; continues. Uploads can lag by minutes. Attempts with
                recording gaps are left out of a finding rather than counted as
                zero.
              </p>
              <p>
                Nothing here measures intelligence, attention or dependence on AI.
                No recorded help in the editor doesn&apos;t mean no outside help.
                Model results are single observed tries on the exact same
                challenge version. Comparisons with other people appear only once
                enough comparable participants exist, with small groups hidden.
              </p>
              <p>
                Reset clears this device&apos;s progress, not your uploads, so the
                report can still read them; deleting your account removes both.
                Going stealth turns this report off.{" "}
                <Link className="t-cmd" href="/settings">
                  Manage your data →
                </Link>
              </p>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
