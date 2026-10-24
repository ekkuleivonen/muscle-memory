"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteAccount,
  resetProgress,
  saveProfile,
  setExcludeFromPublishedData,
} from "../../../lib/account";
import { LEGAL_UPDATED } from "../../../lib/legal";
import type { Profile } from "../../../lib/onboarding";
import { QUESTIONS } from "../../onboarding/questions";
import { useAccount } from "./profile-menu";
import { TerminalIcon } from "./icons";

/** Profile answers, privacy, the terminal and the danger zone, all for this browser. */
export function SettingsForm() {
  const account = useAccount();
  if (!account)
    return (
      <p className="dim">
        No profile on this device. <Link href="/onboarding">Run setup</Link>.
      </p>
    );
  return (
    <Settings
      handle={account.handle ?? "…"}
      initial={account.profile}
      excluded={account.excludeFromPublishedData === true}
      acceptedAt={account.accepted?.at}
    />
  );
}

function Settings({
  handle,
  initial,
  excluded,
  acceptedAt,
}: {
  handle: string;
  initial: Profile;
  excluded: boolean;
  acceptedAt?: string;
}) {
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

      <Privacy excluded={excluded} acceptedAt={acceptedAt} />

      <section className="settings-section">
        <h2>Terminal setup</h2>
        <p className="dim">
          Go through the setup questions again in the terminal you started in.
        </p>
        <Link className="btn" href="/onboarding?again=1">
          <TerminalIcon /> Open terminal setup
        </Link>
      </section>

      <DangerZone handle={handle} />
    </>
  );
}

function Privacy({
  excluded,
  acceptedAt,
}: {
  excluded: boolean;
  acceptedAt?: string;
}) {
  return (
    <section className="settings-section" id="privacy">
      <h2>Privacy</h2>
      <p className="dim">
        What you do here is recorded to run the product: picking your next
        issues, comparing you with other people and LLMs, and making better
        issues. The <Link href="/privacy">Privacy Notice</Link> has the details
        {acceptedAt && (
          <>
            ; you accepted the version of {LEGAL_UPDATED} on{" "}
            {new Date(acceptedAt).toLocaleDateString()}
          </>
        )}
        .
      </p>
      <label className="choice toggle">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(event) =>
            setExcludeFromPublishedData(event.target.checked)
          }
        />
        Exclude my data from published datasets
      </label>
      <p className="hint">
        We may publish anonymised stats and records so anyone can see how people
        (and LLMs) solve issues. Ticking this leaves you out of those, including
        anything we publish later from what you&apos;ve already done. Your own
        stats and comparisons keep working.
      </p>
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
