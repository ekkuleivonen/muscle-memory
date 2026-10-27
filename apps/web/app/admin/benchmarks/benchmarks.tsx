"use client";
/**
 * Model runs from the operator's tab (docs/model-runs.md), as a to-do list. The roster is a set
 * of targets (a model at a reasoning effort); every target is run on every live challenge
 * revision with the current harness, a fixed number of tries, never more. Go makes the queue
 * exactly what is still missing and works through it in this tab, through the real practice
 * session. Safe to press any time. The OpenRouter key lives only in this component's memory:
 * never stored, never sent anywhere but OpenRouter, never recorded.
 */
import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import type { Claimed, Coverage, Target } from "../../../../../packages/model-runs/ledger";
import { EFFORTS, requestFor } from "../../../../../packages/model-runs/admin";
import { summarize, type TargetCoverage } from "../../../../../packages/model-runs/coverage";
import { OPENROUTER } from "../../../../../packages/model-runs/openrouter";
import { BrowserPractice } from "../../../../../packages/model-runs/practice";
import { runModel } from "../../../../../packages/model-runs/run";

interface Overview {
  harnessVersion: string;
  tries: number;
  live: string[];
  targets: Target[];
  coverage: Coverage[];
  recent: Record<string, string | number | null>[];
}

/** What OpenRouter lists about a model: what the page needs of it. */
interface Listed {
  name: string;
  supported: string[];
  efforts: string[];
  prompt: number;
  completion: number;
}

interface Logged {
  at: string;
  worker: number;
  text: string;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error ?? `${path}: ${response.status}`);
  return value as T;
}

const percent = (part: number, whole: number) => (whole ? `${Math.floor((part / whole) * 100)}%` : "–");

export function Benchmarks({ harnessVersion }: { harnessVersion: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [listing, setListing] = useState<Map<string, Listed>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [workers, setWorkers] = useState(2);
  const [active, setActive] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [log, setLog] = useState<Logged[]>([]);
  const [spent, setSpent] = useState(0);
  const stopping = useRef(false);
  const sandboxes = useRef<HTMLDivElement>(null);

  const note = (worker: number, text: string) =>
    setLog((current) => [{ at: new Date().toLocaleTimeString(), worker, text }, ...current].slice(0, 200));

  async function refresh() {
    try {
      const response = await fetch("/admin/api/model-runs");
      if (!response.ok) throw new Error(`The ledger is unavailable (${response.status}).`);
      setOverview(await response.json());
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  /** OpenRouter's public model list: names, prices, parameters and reasoning efforts. */
  async function loadListing(): Promise<Map<string, Listed>> {
    const response = await fetch(`${OPENROUTER}/models`);
    const data = (await response.json()).data as {
      id: string;
      name: string;
      supported_parameters: string[];
      reasoning?: { supported_efforts?: string[] };
      pricing?: { prompt?: string; completion?: string };
    }[];
    const listed = new Map(
      data.map((m) => [
        m.id,
        {
          name: m.name,
          supported: m.supported_parameters,
          efforts: m.reasoning?.supported_efforts ?? [],
          prompt: Number(m.pricing?.prompt ?? NaN) * 1e6,
          completion: Number(m.pricing?.completion ?? NaN) * 1e6,
        },
      ]),
    );
    setListing(listed);
    return listed;
  }

  useEffect(() => {
    void refresh();
    loadListing().catch(() => undefined);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const setTarget = (target: Target, remove = false) =>
    act(() => post("/admin/api/model-runs/roster", { ...target, remove }));

  /** One worker: claim, play, hand in, until nothing is left or the operator stops. */
  async function worker(n: number, apiKey: string, listed: Map<string, Listed>) {
    while (!stopping.current) {
      // Browsers slow timers in hidden tabs to once a minute: wait rather than record that.
      while (document.hidden && !stopping.current) await new Promise((done) => setTimeout(done, 1000));
      if (stopping.current) break;
      const runId = crypto.randomUUID();
      const claimed = await post<{
        slot: Claimed | null;
        challenge?: { metadata: Catalog["challenges"][number]; revision: Catalog["revisions"][string] };
      }>("/admin/api/model-runs/claim", { runId });
      if (!claimed.slot || !claimed.challenge) {
        note(n, "Nothing left to run.");
        break;
      }
      const { slot, challenge } = claimed;
      const condition = JSON.parse(slot.condition) as Record<string, string>;
      note(n, `${slot.model} · ${condition.reasoning} · ${slot.challengeKey} · try ${slot.try}`);
      let practice: BrowserPractice | undefined;
      try {
        const result = await runModel({
          runId,
          model: slot.model,
          try: slot.try,
          challenge,
          open: async (config) => (practice = await BrowserPractice.open(config, sandboxes.current!)),
          fetch: (input, init) => fetch(input, init),
          apiKey,
          request: requestFor(condition, listed.get(slot.model)?.supported ?? []),
          assignments: condition,
          environment: { runner: "admin", userAgent: navigator.userAgent } as Json,
        });
        await post(`/admin/api/model-runs/${runId}`, {
          action: "finish",
          outcome: result.outcome,
          reason: result.reason,
          turns: result.turns,
          submissions: result.submissions,
          records: result.records,
        });
        const cost = result.records
          .filter((r) => r.kind === "observation" && r.payload.includes('"model.response"'))
          .reduce((sum, r) => sum + (Number(JSON.parse(r.payload).data.usage?.cost) || 0), 0);
        setSpent((total) => total + cost);
        note(
          n,
          `→ ${result.outcome}${result.reason ? ` (${result.reason})` : ""}, ${result.turns} turns, ${result.submissions} submissions, $${cost.toFixed(4)}`,
        );
      } catch (cause) {
        await practice?.close().catch(() => undefined);
        note(n, `→ harness failure: ${(cause as Error).message}`);
        await post(`/admin/api/model-runs/${runId}`, {
          action: "failed",
          error: String((cause as Error).message ?? cause),
        }).catch(() => undefined);
      }
      void refresh();
    }
  }

  /** Go: make the queue what the roster still needs, then work through it. */
  async function go() {
    if (!key.startsWith("sk-or-")) return setError("Paste an OpenRouter key (sk-or-…).");
    stopping.current = false;
    setError(null);
    try {
      const { queued, dropped } = await post<{ queued: number; dropped: number }>("/admin/api/model-runs/sync");
      note(0, `Queued ${queued} missing runs${dropped ? `, dropped ${dropped} no longer needed` : ""}.`);
      await refresh();
      const listed = await loadListing();
      setActive(workers);
      await Promise.all(
        Array.from({ length: workers }, (_, i) =>
          worker(i + 1, key, listed).catch((cause) => note(i + 1, `stopped: ${(cause as Error).message}`)),
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setActive(0);
      void refresh();
    }
  }

  const tries = overview?.tries ?? 3;
  const rows = overview
    ? summarize(overview.coverage, overview.targets, overview.live, overview.harnessVersion, tries)
    : [];
  const todo = rows.reduce((n, r) => n + r.todo, 0);
  const target = rows.filter((r) => r.current && r.onRoster).length * (overview?.live.length ?? 0) * tries;
  const models = [...new Set(rows.map((r) => r.model))];

  return (
    <>
      <h1>Benchmarks</h1>
      <p>
        Every model on the roster plays every live challenge at each of its reasoning levels, {tries}{" "}
        {tries === 1 ? "time" : "times"} and never more, with harness <code>{harnessVersion}</code>, through
        the same practice session as people. Everything is recorded raw, apart from people&apos;s data.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="todo">
        <h2 id="todo">To do</h2>
        <p className="admin-todo">
          <strong>{overview ? todo : "…"}</strong> runs left of {target} ({percent(target - todo, target)} done)
          across {overview?.targets.length ?? 0} targets on {overview?.live.length ?? 0} live challenges.
        </p>
        <p>
          Go queues whatever is missing, drops waiting runs the roster no longer needs, and runs the rest in
          this tab. Finished runs are never repeated, so press it whenever. Runs wait while the tab is hidden
          (browsers slow hidden tabs down). The key stays in this page&apos;s memory and goes only to
          OpenRouter: use one with a credit limit, and delete it when you are done.
        </p>
        {hidden && active > 0 && <p className="error">This tab is hidden: runs wait until it is visible again.</p>}
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void go();
          }}
        >
          <label>
            OpenRouter key
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={active > 0}
            />
          </label>
          <label>
            Runs at a time
            <input
              type="number"
              min={1}
              max={4}
              value={workers}
              onChange={(e) => setWorkers(Number(e.target.value))}
              disabled={active > 0}
            />
          </label>
          {active > 0 ? (
            <button type="button" onClick={() => (stopping.current = true)}>
              Stop after the current runs
            </button>
          ) : (
            <button type="submit" disabled={!overview || todo === 0}>
              Go
            </button>
          )}
        </form>
        <p>
          {active > 0 ? `${active} running.` : "Not running."} Spent this session: ${spent.toFixed(4)}.
        </p>
        <ol className="admin-run-log" aria-label="Runner log">
          {log.map((entry, i) => (
            <li key={i}>
              <span className="faint">
                {entry.at}
                {entry.worker ? ` · ${entry.worker}` : ""}
              </span>{" "}
              {entry.text}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="models">
        <h2 id="models">Models</h2>
        {models.map((m) => (
          <ModelCard
            key={m}
            model={m}
            listed={listing.get(m)}
            rows={rows.filter((r) => r.model === m)}
            tries={tries}
            onAdd={(effort) => setTarget({ model: m, effort })}
            onRemove={(effort) => setTarget({ model: m, effort }, true)}
          />
        ))}
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void setTarget({ model: model.trim(), effort: "default" });
            setModel("");
          }}
        >
          <label>
            Add a model (as OpenRouter names it)
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="anthropic/claude-opus-5.5"
              list="openrouter-models"
              required
            />
            <datalist id="openrouter-models">
              {[...listing.keys()].sort().map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
          <button type="submit">Add at its default reasoning</button>
        </form>
      </section>

      {overview && overview.recent.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent">Latest runs</h2>
          <div className="admin-inventory" role="region" aria-label="Latest runs" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Model</th>
                  <th scope="col">Challenge</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Status</th>
                  <th scope="col">Turns</th>
                  <th scope="col">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((r) => (
                  <tr key={String(r.run_id)}>
                    <td>{String(r.started_at)}</td>
                    <td>{String(r.model)}</td>
                    <td>
                      {String(r.challenge_key)} #{String(r.try)}
                    </td>
                    <td>
                      <code>{String(r.condition)}</code>
                    </td>
                    <td>
                      {String(r.outcome ?? r.status)}
                      {r.reason ? ` (${r.reason})` : ""}
                      {r.harness_error ? ` · ${r.harness_error}` : ""}
                    </td>
                    <td>{r.turns ?? ""}</td>
                    <td>{r.submissions ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div ref={sandboxes} hidden />
    </>
  );
}

/** One model: its coverage per reasoning level and harness version, and its targets. */
function ModelCard({
  model,
  listed,
  rows,
  tries,
  onAdd,
  onRemove,
}: {
  model: string;
  listed: Listed | undefined;
  rows: TargetCoverage[];
  tries: number;
  onAdd(effort: string): void;
  onRemove(effort: string): void;
}) {
  const offered = ["default", ...(listed?.efforts ?? [])];
  const missing = EFFORTS.filter((e) => offered.includes(e) && !rows.some((r) => r.current && r.onRoster && r.effort === e));
  const [effort, setEffort] = useState("");
  return (
    <article className="admin-model" aria-labelledby={`model-${model}`}>
      <h3 id={`model-${model}`}>
        <code>{model}</code>
        {listed && (
          <span className="faint">
            {" "}
            · {listed.name}
            {Number.isFinite(listed.prompt) &&
              ` · $${listed.prompt.toFixed(2)} / $${listed.completion.toFixed(2)} per 1M tokens in / out`}
          </span>
        )}
      </h3>
      <div className="admin-inventory" role="region" aria-label={`${model} coverage`} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Reasoning</th>
              <th scope="col">Harness</th>
              <th scope="col">Challenges covered ({tries} tries each)</th>
              <th scope="col">Runs finished</th>
              <th scope="col">Completed</th>
              <th scope="col">Waiting</th>
              <th scope="col">To do</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.effort} ${r.harnessVersion}`} className={r.current && r.onRoster ? undefined : "faint"}>
                <th scope="row">{r.effort}</th>
                <td>
                  <code>{r.harnessVersion}</code>
                  {!r.current && " (earlier)"}
                  {r.current && !r.onRoster && " (off the roster)"}
                </td>
                <td>
                  <meter min={0} max={r.live} value={r.covered} aria-label={`${r.effort} coverage`} /> {r.covered} /{" "}
                  {r.live}
                  {r.started > r.covered && <span className="faint"> ({r.started} started)</span>}
                </td>
                <td>{r.finished}</td>
                <td>
                  {r.completed} {r.finished > 0 && <span className="faint">({percent(r.completed, r.finished)})</span>}
                </td>
                <td>
                  {r.waiting}
                  {r.harnessFailures > 0 && <span className="faint"> ({r.harnessFailures} harness failures)</span>}
                </td>
                <td>{r.todo}</td>
                <td>
                  {r.current && r.onRoster && (
                    <button type="button" onClick={() => onRemove(r.effort)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(effort || missing[0]);
            setEffort("");
          }}
        >
          <label>
            Reasoning level
            <select value={effort || missing[0]} onChange={(e) => setEffort(e.target.value)}>
              {missing.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <button type="submit">Add reasoning level</button>
          {missing.length > 1 && (
            <button type="button" onClick={() => missing.forEach((e) => onAdd(e))}>
              Add all {missing.length}
            </button>
          )}
        </form>
      )}
    </article>
  );
}
