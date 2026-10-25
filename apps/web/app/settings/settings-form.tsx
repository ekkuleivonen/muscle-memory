"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { answerQuestions, setStealth } from "../../lib/account";
import { QUESTIONS } from "../../lib/questions";
import type { Profile } from "../../lib/profile";
import { readTheme, setTheme, type Theme } from "../../lib/theme";
import { useAccount } from "../(browse)/_components/profile-menu";
import { logProfile } from "../(browse)/_components/board-log";

export function SettingsForm() {
  const account = useAccount();
  const [theme, updateTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => updateTheme(readTheme()), []);
  useEffect(() => {
    if (account?.handle && location.hash)
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [account?.handle]);
  function change(action: () => void, label: string) {
    try {
      action();
      setError("");
      setSaved(`${label} saved in this browser.`);
    } catch {
      setError(
        "Could not save. Check that browser storage is available, then try again.",
      );
    }
  }
  if (!account) return <p role="status">Reading settings…</p>;
  return (
    <main className="settings-form">
      <nav aria-label="Settings navigation">
        <Link href="/dashboard">← Back to your desk</Link>
        <Link href="/settings?view=terminal">Terminal settings</Link>
      </nav>
      <h1>Settings</h1>
      <p className="dim">
        {account.handle} · Saved in this browser, without device sync.
      </p>
      <p role="status">{saved}</p>
      {error && <p role="alert">{error}</p>}
      <section id="theme">
        <h2>Appearance</h2>
        <label>
          Theme{" "}
          <select
            value={theme}
            onChange={(e) =>
              change(() => {
                const value = e.target.value as Theme;
                setTheme(value);
                updateTheme(value);
              }, "Theme")
            }
          >
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
      <section id="privacy">
        <h2>Privacy</h2>
        <label>
          <input
            type="checkbox"
            checked={!!account.stealth}
            onChange={(e) =>
              change(() => {
                setStealth(e.target.checked);
                void logProfile("settings");
              }, "Privacy preference")
            }
          />{" "}
          Go stealth
        </label>
        <p>
          Stealth excludes your activity from future published datasets and
          community comparisons. Recording and uploads continue; stealth is not
          a pause button.
        </p>
        <p>
          <Link href="/privacy">Privacy Notice</Link> ·{" "}
          <Link href="/terms">Terms</Link> (drafts)
        </p>
      </section>
      <section id="profile">
        <h2>Your preferences</h2>
        <p className="dim">
          Every question is optional. Change just the answer you need.
        </p>
        {QUESTIONS.map((question) => (
          <fieldset key={question.id} id={question.id}>
            <legend>{question.message}</legend>
            {question.kind === "multiselect" ? (
              question.choices.map((choice) => (
                <label key={choice.value}>
                  <input
                    type="checkbox"
                    checked={
                      account.profile.languages?.includes(choice.value) ?? false
                    }
                    onChange={(e) =>
                      change(() => {
                        const values = account.profile.languages ?? [];
                        answerQuestions({
                          languages: e.target.checked
                            ? [...values, choice.value]
                            : values.filter((value) => value !== choice.value),
                        });
                        void logProfile("settings");
                      }, "Languages")
                    }
                  />
                  {choice.label}
                  {"hint" in choice && choice.hint ? ` (${choice.hint})` : ""}
                </label>
              ))
            ) : (
              <select
                aria-label={question.message}
                value={account.profile[question.id] ?? ""}
                onChange={(e) =>
                  change(() => {
                    answerQuestions({
                      [question.id]: e.target.value || undefined,
                    } as Partial<Profile>);
                    void logProfile("settings");
                  }, "Preference")
                }
              >
                <option value="">Not answered</option>
                {question.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            )}
          </fieldset>
        ))}
      </section>
      <section className="settings-data">
        <h2>Session and data</h2>
        <p>
          Logging out keeps your code and progress here. Reset clears local
          practice, but keeps uploaded records. Delete removes local and
          uploaded records; it needs a connection. Export saves everything
          here as one file, to keep or to import in another browser.
        </p>
        <Link href="/settings?view=terminal">
          Open session, backup and deletion commands →
        </Link>
      </section>
    </main>
  );
}
