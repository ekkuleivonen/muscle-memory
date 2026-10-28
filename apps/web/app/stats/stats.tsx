"use client";
import { reportProfile } from "../../lib/profile";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { languageLabel } from "../../lib/challenges";
import { dismiss, readDismissed } from "../../lib/invitations";
import { buildReport, mergeEvidence, type Report } from "../../lib/report";
import type { ChallengeSummary } from "../../lib/challenges";
import { useReportData, type HistoryStatus } from "./report-data";
import { QuestionView } from "./report-view";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";

const NONE: AttemptSummary[] = [];
const NO_REVISIONS: { challenge: string; revision: string }[] = [];

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

/** The languages form, returning to this answer on the report after save or cancel. */
export const LANGUAGES_FORM = "/settings/profile/languages?from=stats";

const list = (names: readonly string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * The optional languages question, under the answer it would group (ENG-360). Quiet: it never
 * takes focus on its own, blocks nothing, and once hidden stays hidden on this browser. A quick-start guess is named as a guess and
 * stays one until confirmed in the form.
 */
export function LanguagesInvite({ guess }: { guess: readonly string[] }) {
  const [state, setState] = useState<"reading" | "shown" | "hidden" | "kept" | "unsaved">("reading");
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    let hidden = false;
    try {
      hidden = readDismissed(localStorage).has("languages");
    } catch {}
    setState(hidden ? "hidden" : "shown");
  }, []);
  useEffect(() => {
    // The button just pressed is gone; keep keyboard focus on what replaced it.
    if (state === "kept" || state === "unsaved") line.current?.focus();
  }, [state]);
  if (state === "reading" || state === "hidden") return null;
  if (state !== "shown")
    return (
      <p className="report-fyi" role="status" tabIndex={-1} ref={line}>
        {state === "kept"
          ? "Hidden. Your languages stay in "
          : "Hidden for now, but this browser couldn't remember that, so it may show again. Your languages stay in "}
        <Link className="t-cmd" href="/settings/profile">
          settings → profile
        </Link>
        .
      </p>
    );
  return (
    <InviteCopy
      guess={guess}
      onHide={() => {
        let kept = false;
        try {
          kept = dismiss("languages", localStorage);
        } catch {}
        setState(kept ? "kept" : "unsaved");
      }}
    />
  );
}

/** What the invitation says: what an answer does here, that a guess is a guess, and where it goes. */
export function InviteCopy({ guess, onHide }: { guess: readonly string[]; onHide?: () => void }) {
  const named = guess.length
    ? `${list(guess)} ${guess.length === 1 ? "is" : "are"} ticked from quick start, as a guess. Confirm or change it`
    : "Say which languages you work with";
  return (
    <div className="report-invite">
      <p>
        Optional: {named}, and this report splits your practice into your usual languages and
        others. Trying a challenge doesn&apos;t make its language one of yours. Your answer is
        saved with your profile, as the{" "}
        <Link className="t-cmd" href="/privacy">
          Privacy Notice
        </Link>{" "}
        describes.
      </p>
      <p>
        <Link className="t-cmd" href={LANGUAGES_FORM}>
          {guess.length ? "Confirm your languages" : "Set your languages"} →
        </Link>
        <span className="t-dim"> · </span>
        <button type="button" className="t-cmd" onClick={onHide}>
          Hide this
        </button>
      </p>
    </div>
  );
}

/** The bottom of the report: questions it can answer once there's the practice for them. */
export function Discover({ report }: { report: Report }) {
  if (!report.discover.length) return null;
  return (
    <section className="report-discover t-md" aria-labelledby="discover-title">
      <h3 id="discover-title">Still to discover</h3>
      <ul>
        {report.discover.map((d) => (
          <li key={d.id}>
            <span className="report-discover-question">{d.question}</span>
            <span className="t-dim">
              {d.need}
              {d.action && (
                <>
                  {" "}
                  <Link className="t-cmd" href={d.action.href}>
                    {d.action.label} →
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {report.discoverNote && <p className="report-note">{report.discoverNote}</p>}
    </section>
  );
}

export function ReportBody({
  report,
  status,
  guess = [],
}: {
  report: Report;
  status: React.ReactNode;
  /** Quick-start languages not yet confirmed, by label. */
  guess?: readonly string[];
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
        <Discover report={report} />
      </section>
    );
  return (
    <>
      <header className="report-hero">
        <h1 className="t-doc-title">How you code</h1>
        {report.takeaways.length > 0 && (
          // The few strongest answers first, each leading to the answer it sums up.
          <ul className="report-takeaways" aria-label="Takeaways">
            {report.takeaways.map((t) => (
              <li key={t.id}>
                <a href={`#q-${t.id}`}>{t.text}</a>
              </li>
            ))}
          </ul>
        )}
        {status}
        {report.waiting && <p className="report-context">{report.waiting}</p>}
        {report.waiting && next}
      </header>
      {report.questions.map((q) => (
        <QuestionView key={q.id} q={q}>
          {q.id === "languages" && report.languagesInvite && <LanguagesInvite guess={guess} />}
          {q.id === "familiarity" && (
            <p className="report-fyi">
              <Link className="t-cmd" href={LANGUAGES_FORM}>
                Edit your usual languages
              </Link>
            </p>
          )}
        </QuestionView>
      ))}
      {!report.waiting && next}
      <Discover report={report} />
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
  // No model results are requested: they count only submissions, which aren't comparable with a person's.
  const { privacy, local, history, retryHistory } = useReportData(NO_REVISIONS);
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
          })
        : null,
    [catalog, device, attempts],
  );
  const stored = device?.profile;
  const guess = stored && !stored.asked?.languages?.answeredAt ? (stored.profile.languages ?? []).map(languageLabel) : [];
  // Back from a settings form (/stats#q-languages): the answer renders after storage is read.
  const returned = useRef(false);
  useEffect(() => {
    if (!report || returned.current) return;
    const target = location.hash.startsWith("#q-") ? document.getElementById(location.hash.slice(1)) : null;
    // Wait for the answer itself; the first report may come before every answer does.
    if (location.hash.startsWith("#q-") && !target) return;
    returned.current = true;
    target?.scrollIntoView();
  }, [report]);
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
              guess={guess}
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
