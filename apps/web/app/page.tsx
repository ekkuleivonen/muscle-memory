"use client";
import { useRef, useState } from "react";
import { useLocalPractice } from "./use-local-practice";
import {
  createAttemptEvent,
  type AttemptEvent,
} from "../../../packages/domain/events";
import catalogData from "../../../content/catalog/reference.v1.json";
import {
  findEntry,
  startAttempt,
  assessAttempt,
  type StartableAttempt,
} from "../../../packages/catalog/gates";
import type { Catalog } from "../../../packages/catalog/catalog";
import { currentCatalog } from "./current-catalog";
import {
  assess,
  parseOutputs,
  snapshot,
  type Adventure,
  type Challenge,
  type Attempt,
} from "../../../packages/domain/assessment";
// Generated and checked through the authoring lifecycle before build.
const initialCatalog = catalogData as unknown as Catalog;
const initialAdventure = findEntry(initialCatalog, {
  kind: "adventure",
  id: "field-notes",
  version: "1.0.0",
})!.content as Adventure;
const [challengeId, challengeVersion] = initialAdventure.challenges[0];
const initialChallenge = findEntry(initialCatalog, {
  kind: "challenge",
  id: challengeId,
  version: challengeVersion,
})!.content as Challenge;
export default function Home() {
  const [active, setActive] = useState<StartableAttempt | null>(null);
  const adventure = active?.adventure ?? initialAdventure;
  const challenge = active?.challenge ?? initialChallenge;
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [assistance, setAssistance] =
    useState<Attempt["assistance"]>("undisclosed");
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof assess> | null>(null);
  const [saveLocally, setSaveLocally] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const pending = useRef<AttemptEvent | null>(null);
  const local = useLocalPractice(saveLocally);
  async function begin() {
    setBusy(true);
    setError("");
    try {
      const catalog = await currentCatalog();
      setActive(
        startAttempt(catalog, initialAdventure.id, initialAdventure.version),
      );
      setStartedAt(new Date().toISOString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This Adventure is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    setResult(null);
    setSavedMessage("");
    try {
      if (!consent || !startedAt || !active)
        throw new Error("Start the Adventure first.");
      const submittedAt = new Date().toISOString();
      const participantId = saveLocally
        ? await local.participantId()
        : "local-practice";
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        participantId,
        challengeId: challenge.id,
        challengeVersion: challenge.version,
        challengeSnapshot: snapshot(challenge),
        encounter: active.encounter,
        outputs: parseOutputs(answer),
        assistance,
        hintsShown: hint ? [0] : [],
        startedAt,
        submittedAt,
        activeSeconds: null,
        consentVersion: "local-practice-v1",
      };
      // No active-time tracker yet; null means unmeasured. No time-based score.
      const catalog = await currentCatalog();
      if (saveLocally) {
        const record =
          pending.current ??
          createAttemptEvent(adventure, challenge, {
            ...attempt,
            consentVersion: "device-local-practice-v1",
          });
        pending.current = record;
        assessAttempt(catalog, record.attempt);
        await local.save(record);
        setResult(record.assessment);
        pending.current = null;
        setSavedMessage("Saved on this device. Research sharing is off.");
      } else setResult(assessAttempt(catalog, attempt));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to check answers.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function clearSaved() {
    setBusy(true);
    setError("");
    try {
      await local.clear();
      pending.current = null;
      setResult(null);
      setAnswer("");
      setHint(false);
      setAssistance("undisclosed");
      setStartedAt(null);
      setActive(null);
      setConsent(false);
      setSavedMessage(
        "Saved practice, pending exports and local identity cleared. Downloaded copies must be removed separately.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to clear saved practice.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <a href="/" className="brand">
          muscle memory<span>KEEP YOUR CRAFT</span>
        </a>
        <a href="https://github.com/ekkuleivonen/muscle-memory">
          Open source ↗
        </a>
      </header>
      <section className="intro">
        <p className="eyebrow">A LITTLE PRACTICE. ALL YOURS.</p>
        <h1>
          You still have
          <br />
          it in you.
        </h1>
        <p>
          AI can share the workday. Take a few minutes to enjoy writing code
          yourself.
        </p>
      </section>
      <section className="adventure">
        <div className="chapter">
          ADVENTURE 001 <span>MAPS · ITERATION · EDGE CASES</span>
        </div>
        <h2>Field notes</h2>
        <p>{adventure.story}</p>
        {!startedAt ? (
          <div>
            <p className="note">
              Session-only by default. You can optionally save practice on this
              device. No account, server upload or research data collection.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={saveLocally}
                onChange={(event) => setSaveLocally(event.target.checked)}
              />{" "}
              Save practice history on this device (optional).
            </label>
            {saveLocally && (
              <p className="note">
                Saved events include your answers, assistance disclosure and
                task context. They remain on this browser until you clear them.
                Research sharing stays off.
              </p>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I understand and want to practice locally.
            </label>
            <button disabled={!consent || busy} onClick={begin}>
              Open the notebook →
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3>Your Challenge</h3>
            <p>{challenge.task}</p>
            <ol>
              {challenge.inputs.map((input, i) => (
                <li key={i}>
                  <code>{JSON.stringify(input)}</code>
                </li>
              ))}
            </ol>
            <button
              disabled={busy}
              type="button"
              className="secondary"
              onClick={() => {
                setHint(true);
                pending.current = null;
              }}
            >
              Show a hint
            </button>
            {hint && <p className="note">{challenge.hints[0]}</p>}
            <label htmlFor="answers">Your outputs, in fixture order</label>
            <textarea
              disabled={busy}
              id="answers"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setResult(null);
                pending.current = null;
              }}
              placeholder='[{"a":2,"b":1}, {}, ...]'
              spellCheck={false}
            />
            <label htmlFor="assistance">How did you approach this?</label>
            <select
              disabled={busy}
              id="assistance"
              value={assistance}
              onChange={(e) => {
                setAssistance(e.target.value as Attempt["assistance"]);
                pending.current = null;
              }}
            >
              <option value="undisclosed">Prefer not to say</option>
              <option value="unaided">By myself</option>
              <option value="assisted">With assistance</option>
            </select>
            <button type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : pending.current
                  ? "Retry saving this attempt"
                  : "Check my outputs →"}
            </button>
            {result && (
              <section aria-live="polite" className="result">
                <h3>Your notebook, checked.</h3>
                <p>{result.feedback}</p>
                <ol>
                  {result.passed.map((pass, i) => (
                    <li key={i}>
                      Fixture {i + 1}: {pass ? "Correct" : "Try again"}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </form>
        )}
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {savedMessage && (
        <p role="status" className="note">
          {savedMessage}
        </p>
      )}
      {saveLocally && (
        <section
          className="local-history"
          aria-labelledby="local-history-title"
        >
          <h3 id="local-history-title">Your device-local practice</h3>
          <p>
            {local.saved.length} saved attempt(s). Nothing is shared for
            research.
          </p>
          {local.error && <p role="alert">{local.error}</p>}
          <ul>
            {local.saved
              .slice(-5)
              .reverse()
              .map((record) => (
                <li key={record.eventId}>{record.assessment.feedback}</li>
              ))}
          </ul>
          <button
            className="secondary"
            disabled={busy || !local.saved.length}
            onClick={() =>
              local.download().catch((cause) => setError(cause.message))
            }
          >
            Download local events
          </button>{" "}
          <button
            className="secondary"
            disabled={busy || !local.saved.length}
            onClick={clearSaved}
          >
            Clear saved practice and identity
          </button>
          <p className="note">
            Downloads stay retryable because this browser cannot confirm a file
            was saved. Clearing removes local events and pending exports;
            downloaded copies need separate deletion. Browser storage may also
            be cleared by your browser.
          </p>
        </section>
      )}
      <p className="note">
        Preview: write and run Python in the{" "}
        <a href="/workspace">frequency map workspace</a>, sandboxed in this
        browser.
      </p>
      <footer>
        <p>Practice, not a verdict.</p>
        <p>
          We’re also curious about how developer skills evolve and compare with
          coding models. Any future research participation will be voluntary,
          with private individual results and public aggregates.
        </p>
      </footer>
    </main>
  );
}
