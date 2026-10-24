"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  ACCOUNT_CHANGE,
  deleteAccount,
  resetProgress,
  saveProfile,
} from "../../../lib/account";
import {
  ACTIVITY_DISCLOSURE,
  ACTIVITY_KEY,
  consentRecord,
  parseConsent,
} from "../../../lib/activity-log";
import type { Profile } from "../../../lib/onboarding";
import { QUESTIONS } from "../../onboarding/questions";
import { useAccount } from "./profile-menu";
import { TerminalIcon } from "./icons";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ACCOUNT_CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ACCOUNT_CHANGE, onChange);
  };
}

/** Profile answers, privacy, the terminal and the danger zone, all for this browser. */
export function SettingsForm() {
  const account = useAccount();
  if (!account)
    return (
      <p className="dim">
        No profile on this device. <Link href="/onboarding">Run setup</Link>.
      </p>
    );
  return <Settings handle={account.handle ?? "…"} initial={account.profile} />;
}

function Settings({ handle, initial }: { handle: string; initial: Profile }) {
  const [profile, setProfile] = useState<Profile>(initial);
  const [saved, setSaved] = useState(false);
  const languages = profile.languages ?? [];
  const dirty = JSON.stringify(profile) !== JSON.stringify(initial);

  function set<K extends keyof Profile>(key: K, value: Profile[K] | "") {
    setSaved(false);
    setProfile((current) => {
      const next = { ...current };
      if (value === "" || value === undefined) delete next[key];
      else next[key] = value as Profile[K];
      return next;
    });
  }

  return (
    <>
      <form
        className="settings-section"
        onSubmit={(event) => {
          event.preventDefault();
          saveProfile(profile);
          setSaved(true);
        }}
      >
        <h2>Profile</h2>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input id="handle" value={handle} readOnly className="mono" />
          <p className="hint">
            Handed out at random, like on Reddit, so it says nothing about who
            you are. It&apos;s how you&apos;ll appear to others.
          </p>
        </div>
        {QUESTIONS.map((question) =>
          question.kind === "multiselect" ? (
            <fieldset className="field" key={question.id}>
              <legend>{question.message}</legend>
              <div className="choices">
                {question.choices.map((choice) => (
                  <label key={choice.value} className="choice">
                    <input
                      type="checkbox"
                      checked={languages.includes(choice.value)}
                      onChange={(event) =>
                        set(
                          "languages",
                          event.target.checked
                            ? [...languages, choice.value]
                            : languages.filter((l) => l !== choice.value),
                        )
                      }
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="field" key={question.id}>
              <label htmlFor={question.id}>{question.message}</label>
              <select
                id={question.id}
                value={(profile[question.id] as string | undefined) ?? ""}
                onChange={(event) =>
                  set(
                    question.id,
                    event.target.value as Profile[typeof question.id],
                  )
                }
              >
                <option value="">Not set</option>
                {question.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                    {"hint" in choice && choice.hint ? ` (${choice.hint})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ),
        )}
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={!dirty}>
            Save changes
          </button>
          {saved && !dirty && <span className="hint">Saved.</span>}
        </div>
      </form>

      <ActivityLog />

      <section className="settings-section">
        <h2>Terminal setup</h2>
        <p className="dim">
          The same questions, answered in the setup terminal. It also exports
          everything saved on this device.
        </p>
        <Link className="btn" href="/onboarding">
          <TerminalIcon /> Open terminal setup
        </Link>
      </section>

      <DangerZone handle={handle} />
    </>
  );
}

function ActivityLog() {
  const on = useSyncExternalStore(
    subscribe,
    () => parseConsent(localStorage.getItem(ACTIVITY_KEY)) !== null,
    () => false,
  );
  return (
    <section className="settings-section" id="privacy">
      <h2>Privacy</h2>
      <label className="choice toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => {
            if (event.target.checked)
              localStorage.setItem(
                ACTIVITY_KEY,
                consentRecord(new Date().toISOString()),
              );
            else localStorage.removeItem(ACTIVITY_KEY);
            window.dispatchEvent(new Event(ACCOUNT_CHANGE));
          }}
        />
        Keep a private activity log
      </label>
      {ACTIVITY_DISCLOSURE.map((line) => (
        <p className="hint" key={line}>
          {line}
        </p>
      ))}
    </section>
  );
}

function DangerZone({ handle }: { handle: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section danger-zone">
      <h2>Danger zone</h2>
      <div className="danger-row">
        <div>
          <b>Reset all progress</b>
          <p className="hint">
            Empties your board and deletes saved practice and recorded activity.
            Your handle and settings stay.
          </p>
        </div>
        {confirming === "reset" ? (
          <div className="danger-confirm">
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await resetProgress();
                  setConfirming(null);
                  setDone("Progress reset.");
                })
              }
            >
              Yes, reset progress
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              setDone(null);
              setConfirming("reset");
            }}
          >
            Reset progress
          </button>
        )}
      </div>
      <div className="danger-row">
        <div>
          <b>Delete account and all data</b>
          <p className="hint">
            Removes your handle, profile, board, saved practice and activity
            from this browser, then signs you out. This can&apos;t be undone.
            Downloaded exports are not affected.
          </p>
        </div>
        {confirming !== "delete" && (
          <button
            className="btn danger"
            type="button"
            onClick={() => {
              setDone(null);
              setTyped("");
              setConfirming("delete");
            }}
          >
            Delete account
          </button>
        )}
      </div>
      {confirming === "delete" && (
        <form
          className="danger-confirm wide"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed !== handle) return;
            void run(async () => {
              await deleteAccount();
              router.push("/onboarding");
            });
          }}
        >
          <label htmlFor="confirm-handle">
            Type <b className="mono">{handle}</b> to confirm.
          </label>
          <input
            id="confirm-handle"
            className="mono"
            autoComplete="off"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <div className="form-actions">
            <button
              className="btn danger"
              type="submit"
              disabled={busy || typed !== handle}
            >
              Delete account and all data
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {done && (
        <p className="hint" role="status">
          {done}
        </p>
      )}
    </section>
  );
}
