"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import type { WorkspaceRecord } from "../../../../packages/domain/workspace";
import { acceptConsent, readProfile } from "../../lib/account";
import { statusOf } from "../../lib/board";
import {
  attemptLabel,
  incidentState,
  shortVersion,
  type IncidentState,
} from "../../lib/incident";
import { acceptsCurrent } from "../../lib/legal";
import { useBoard } from "../(browse)/_components/board";
import { logArrival, noteArrival } from "../(browse)/_components/board-log";

type Via = "pointer" | "keyboard";
const viaOf = (event: { detail: number }): Via =>
  event.detail === 0 ? "keyboard" : "pointer";

async function readRecords(): Promise<WorkspaceRecord[]> {
  const store = await openPracticeStore();
  try {
    return await store.workspaceRecords();
  } finally {
    store.close();
  }
}

/**
 * Starting, continuing or replaying the incident. Someone new accepts the Terms explicitly
 * (the box, then Acknowledge the page); someone who already played sees where their latest
 * attempt stands, and a replay is only ever started on purpose, after saying what it does.
 */
export function IncidentStart({
  issue,
  live,
  linked,
  unknownVersion,
  consented: consentedAtLoad,
  referral,
  disclosure,
}: {
  issue: { key: string; slug: string };
  /** The live revision. */
  live: string;
  /** The revision a shared link named, if it names a published one. */
  linked: string | null;
  /** A version in the link that names no published revision. */
  unknownVersion: string | null;
  consented: boolean;
  referral: string | null;
  /** The Terms in four points, as on /consent. */
  disclosure: ReactNode;
}) {
  const router = useRouter();
  const board = useBoard();
  const [consented, setConsented] = useState(consentedAtLoad);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<IncidentState | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Whoever opened a link to a version that doesn't exist chose the current one instead. */
  const [useLive, setUseLive] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  const [renewal, setRenewal] = useState(false);

  useEffect(() => noteArrival(referral), [referral]);
  useEffect(() => {
    try {
      const stored = readProfile();
      if (stored?.signedOut) setReturning(stored.handle ?? "your handle");
      setRenewal(Boolean(stored?.accepted && !acceptsCurrent(stored.accepted)));
      // The cookie alone is not an acceptance this browser holds (storage cleared, cookie
      // kept): nothing could be recorded under it, so ask again, explicitly.
      if (!stored?.accepted || !acceptsCurrent(stored.accepted))
        setConsented(false);
    } catch {
      setError(
        "Could not read browser storage. Allow storage for this site, then reload.",
      );
    }
  }, []);
  useEffect(() => {
    if (!consented) return;
    let live = true;
    readRecords()
      .then((records) => live && setState(incidentState(records)))
      .catch(() =>
        setError(
          "Could not read your practice from this browser. Allow storage and reload.",
        ),
      );
    return () => {
      live = false;
    };
  }, [consented]);

  const chosen = linked ?? (unknownVersion && !useLive ? null : live);
  const status = statusOf(board.items, issue.key);
  const work = (revision: string) =>
    `/work/${issue.key}?revision=${encodeURIComponent(revision)}`;

  /** First response: moves the incident to In progress on the chosen version and opens it. */
  const start = (revision: string, via: Via) => {
    board.move({ ...issue, revision }, "in-progress", via, {
      trigger: "start-work",
    });
    router.push(work(revision));
  };

  const acknowledge = async (via: Via) => {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      if (!consented) {
        acceptConsent();
        await logArrival().catch(() => undefined);
        setConsented(true);
        // Someone who already played here sees where they stand before anything moves.
        const current = incidentState(await readRecords());
        if (current.started || statusOf(board.items, issue.key) === "done") {
          setState(current);
          setBusy(false);
          return;
        }
      }
      start(chosen, via);
    } catch {
      setBusy(false);
      setError(
        "Could not save your session. Allow browser storage and try again.",
      );
    }
  };

  const replay = async (via: Via) => {
    if (!chosen) return;
    setBusy(true);
    setError("");
    const ok = await board.replay({ ...issue, revision: chosen }, via);
    if (!ok) {
      setBusy(false);
      setError(
        "The replay could not be recorded in this browser, so it didn't start. Try again.",
      );
      return;
    }
    router.push(work(chosen));
  };

  const versionNotice = unknownVersion && !linked && (
    <div className="incident-notice" role="note">
      <p>
        This link names incident version <code>{unknownVersion}</code>, which
        isn&apos;t published here, so it can&apos;t be played as shared.
      </p>
      {!useLive && (
        <button type="button" onClick={() => setUseLive(true)}>
          Take the current version ({shortVersion(live)}) instead
        </button>
      )}
    </div>
  );

  if (returning && !consented)
    return (
      <section className="play-start">
        {versionNotice}
        <p>
          You logged out in this browser. Sign back in as {returning} first;
          everything you did is still here.
        </p>
        <Link
          className="home-cta"
          href={`/consent?next=${encodeURIComponent(`/incident${linked ? `?v=${shortVersion(linked)}` : ""}`)}`}
        >
          Sign back in →
        </Link>
      </section>
    );

  if (!consented)
    return (
      <section className="play-start incident-start">
        {versionNotice}
        <h2>Before you take the page</h2>
        {disclosure}
        {renewal && (
          <p className="home-fine">
            The Terms changed since you last accepted them.
          </p>
        )}
        <p className="play-consent">
          You can exclude your activity from future publications with{" "}
          <Link href="/settings#privacy">stealth in Settings</Link>. Recording
          continues in stealth.
        </p>
        <label className="incident-agree">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          I&apos;m 16 or older and I accept the <Link href="/terms">Terms</Link>{" "}
          and <Link href="/privacy">Privacy Notice</Link>, including keystroke
          recording.
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="home-actions">
          <button
            type="button"
            className="home-cta"
            disabled={!agreed || !chosen || busy}
            onClick={(event) => void acknowledge(viaOf(event))}
          >
            {busy ? "Opening…" : "Acknowledge the page →"}
          </button>
          <span className="home-note">
            {agreed
              ? "Opens the incident in the IDE."
              : "Tick the box to accept and start."}
          </span>
        </div>
      </section>
    );

  if (!state)
    return (
      <section className="play-start">
        {versionNotice}
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p className="loading-state">Checking your pager…</p>
        )}
      </section>
    );

  const version = state.revision ? shortVersion(state.revision) : null;
  const label = attemptLabel(state.attempt.number);

  // Done: the latest attempt was merged. Its report, and a replay on purpose.
  if (status === "done")
    return (
      <section className="play-start incident-start">
        {versionNotice}
        {state.merged ? (
          <>
            <h2>You restored checkout.</h2>
            <p>
              {label}
              {version && `, version ${version}`}. The report is filed and yours
              to share.
            </p>
            <div className="home-actions">
              <Link className="home-cta" href="/incident/report">
                Read your incident report →
              </Link>
            </div>
          </>
        ) : (
          <h2>{issue.key} is Done on your board.</h2>
        )}
        {error && <p role="alert">{error}</p>}
        {!confirming ? (
          <p>
            <button
              type="button"
              className="incident-link"
              onClick={() => setConfirming(true)}
            >
              Replay the incident
            </button>
          </p>
        ) : (
          <div
            className="incident-replay"
            role="group"
            aria-label="Replay the incident"
          >
            <p>
              <b>A replay is a new attempt</b> on version{" "}
              {chosen ? shortVersion(chosen) : "–"}: the original broken code, a
              fresh pull request, CI, team chat and numbers, and its own report.
              Everything from your {label.toLowerCase()} stays recorded in this
              browser, including any code you changed after merging. It&apos;s
              recorded as a replay, apart from your first response.
            </p>
            <div className="home-actions">
              <button
                type="button"
                className="home-cta"
                disabled={!chosen || busy}
                onClick={(event) => void replay(viaOf(event))}
              >
                {busy ? "Starting…" : "Start the replay →"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    );

  // Under way: back to it, on the version it started on.
  if (state.started || status === "in-progress")
    return (
      <section className="play-start incident-start">
        {versionNotice}
        <h2>You&apos;re mid-incident.</h2>
        <p>
          {label}
          {version && `, version ${version}`}. Your code and progress are where
          you left them.
        </p>
        {linked && state.revision && linked !== state.revision && (
          <p className="incident-notice" role="note">
            This link is for version {shortVersion(linked)}. Finish the response
            you&apos;re on first; you can replay on {shortVersion(linked)}{" "}
            after.
          </p>
        )}
        <div className="home-actions">
          <Link
            className="home-cta"
            href={state.revision ? work(state.revision) : `/work/${issue.key}`}
          >
            Back to the incident →
          </Link>
        </div>
      </section>
    );

  return (
    <section className="play-start incident-start">
      {versionNotice}
      {error && <p role="alert">{error}</p>}
      <div className="home-actions">
        <button
          type="button"
          className="home-cta"
          disabled={!chosen || busy}
          onClick={(event) => void acknowledge(viaOf(event))}
        >
          {busy ? "Opening…" : "Acknowledge the page →"}
        </button>
        <span className="home-note">Opens the incident in the IDE.</span>
      </div>
    </section>
  );
}
