"use client";
import { useState } from "react";
import adventureData from "../../../content/adventures/field-notes.v1.json";
import challengeData from "../../../content/challenges/frequency-map.v1.json";
import {
  assess,
  encounter,
  parseOutputs,
  snapshot,
  type Adventure,
  type Challenge,
  type Attempt,
} from "../../../packages/domain/assessment";
// Shared JSON manifests are validated by tools/content-check.mjs before build.
const challenge = challengeData as unknown as Challenge;
const adventure: Adventure = {
  ...adventureData,
  challenges: adventureData.challenges.map(([id, version]) => [id, version]),
};
export default function Home() {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);
  const [assistance, setAssistance] =
    useState<Attempt["assistance"]>("undisclosed");
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReturnType<typeof assess> | null>(null);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!consent || !startedAt) throw new Error("Start the Adventure first.");
      const submittedAt = new Date().toISOString();
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        participantId: "local-practice",
        challengeId: challenge.id,
        challengeVersion: challenge.version,
        challengeSnapshot: snapshot(challenge),
        encounter: encounter(adventure),
        outputs: parseOutputs(answer),
        assistance,
        hintsShown: hint ? [0] : [],
        startedAt,
        submittedAt,
        activeSeconds: null,
        consentVersion: "local-practice-v1",
      };
      // No active-time tracker yet; null means unmeasured. No time-based score.
      setResult(assess(challenge, attempt));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to check answers.",
      );
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
              A local practice prototype. Your answers stay in this tab and
              disappear when it closes. No account or research data collection.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              I understand and want to practice locally.
            </label>
            <button
              disabled={!consent}
              onClick={() => setStartedAt(new Date().toISOString())}
            >
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
              type="button"
              className="secondary"
              onClick={() => setHint(true)}
            >
              Show a hint
            </button>
            {hint && <p className="note">{challenge.hints[0]}</p>}
            <label htmlFor="answers">Your outputs, in fixture order</label>
            <textarea
              id="answers"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setResult(null);
              }}
              placeholder='[{"a":2,"b":1}, {}, ...]'
              spellCheck={false}
            />
            <label htmlFor="assistance">How did you approach this?</label>
            <select
              id="assistance"
              value={assistance}
              onChange={(e) =>
                setAssistance(e.target.value as Attempt["assistance"])
              }
            >
              <option value="undisclosed">Prefer not to say</option>
              <option value="unaided">By myself</option>
              <option value="assisted">With assistance</option>
            </select>
            <button type="submit">Check my outputs →</button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
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
