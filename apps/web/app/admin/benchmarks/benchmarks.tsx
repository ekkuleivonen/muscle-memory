"use client";
/**
 * Model runs from the operator's tab (docs/model-runs.md): the roster, queueing every slot a
 * condition calls for, and a runner that claims slots, plays each one in this page through the
 * real practice session, and hands its records to the server. The OpenRouter key lives only in
 * this component's memory: never stored, never sent anywhere but OpenRouter, never recorded.
 */
import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import type { SeriesCount } from "../../../../../packages/model-runs/ledger";
import type { Claimed } from "../../../../../packages/model-runs/ledger";
import { EFFORTS, requestFor } from "../../../../../packages/model-runs/admin";
import { OPENROUTER } from "../../../../../packages/model-runs/openrouter";
import { BrowserPractice } from "../../../../../packages/model-runs/practice";
import { runModel } from "../../../../../packages/model-runs/run";

interface Overview {
  harnessVersion: string;
  roster: string[];
  series: SeriesCount[];
  recent: Record<string, string | number | null>[];
}

interface Logged {
  at: string;
  worker: number;
  text: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error ?? `${path}: ${response.status}`);
  return value as T;
}

export function Benchmarks({ harnessVersion }: { harnessVersion: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<string>("default");
  const [tries, setTries] = useState(3);
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
  useEffect(() => {
    void refresh();
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

  /** One worker: claim, play, hand in, until nothing is queued or the operator stops. */
  async function worker(n: number, apiKey: string, listing: Map<string, string[]>) {
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
      note(n, `${slot.model} · ${slot.challengeKey} · ${condition.reasoning} · try ${slot.try}`);
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
          request: requestFor(condition, listing.get(slot.model) ?? []),
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
        note(n, `→ ${result.outcome}${result.reason ? ` (${result.reason})` : ""}, ${result.turns} turns, ${result.submissions} submissions, $${cost.toFixed(4)}`);
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

  async function start() {
    if (!key.startsWith("sk-or-")) return setError("Paste an OpenRouter key (sk-or-…).");
    stopping.current = false;
    setError(null);
    try {
      const response = await fetch(`${OPENROUTER}/models`);
      const listing = new Map<string, string[]>(
        ((await response.json()).data as { id: string; supported_parameters: string[] }[]).map((m) => [
          m.id,
          m.supported_parameters,
        ]),
      );
      setActive(workers);
      await Promise.all(
        Array.from({ length: workers }, (_, i) =>
          worker(i + 1, key, listing).catch((cause) => note(i + 1, `stopped: ${(cause as Error).message}`)),
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setActive(0);
      void refresh();
    }
  }

  const conditions = [...new Set(overview?.series.map((s) => s.condition) ?? [])];
  const models = [...new Set(overview?.series.map((s) => s.model) ?? [])];
  const count = (m: string, c: string, match: (s: SeriesCount) => boolean) =>
    overview?.series.filter((s) => s.model === m && s.condition === c && match(s)).reduce((n, s) => n + s.runs, 0) ?? 0;

  return (
    <>
      <h1>Benchmarks</h1>
      <p>
        Models play every published challenge through the same practice session as people, and
        everything they do is recorded raw, apart from people&apos;s data. Harness{" "}
        <code>{harnessVersion}</code>.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="roster">
        <h2 id="roster">Roster</h2>
        <ul>
          {overview?.roster.map((m) => (
            <li key={m}>
              <code>{m}</code>{" "}
              <button type="button" onClick={() => act(() => post("/admin/api/model-runs/roster", { model: m, retired: true }))}>
                Retire
              </button>
            </li>
          ))}
        </ul>
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => post("/admin/api/model-runs/roster", { model: model.trim() }));
            setModel("");
          }}
        >
          <label>
            Model (as OpenRouter names it)
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="anthropic/claude-opus-5.5" required />
          </label>
          <button type="submit">Add</button>
        </form>
      </section>

      <section aria-labelledby="queue">
        <h2 id="queue">Queue</h2>
        <p>
          Queues every published revision for every model on the roster, in one condition. Slots
          already queued or run are left alone.
        </p>
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const result = await post<{ queued: number }>("/admin/api/model-runs/backfill", {
                condition: { reasoning: effort },
                tries,
              });
              note(0, `Queued ${result.queued} runs (reasoning ${effort}, ${tries} tries).`);
            });
          }}
        >
          <label>
            Reasoning effort
            <select value={effort} onChange={(e) => setEffort(e.target.value)}>
              {EFFORTS.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <label>
            Tries
            <input type="number" min={1} max={10} value={tries} onChange={(e) => setTries(Number(e.target.value))} />
          </label>
          <button type="submit">Queue</button>
        </form>
        {models.length > 0 && (
          <div className="admin-inventory" role="region" aria-label="Runs by model and condition" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Queued</th>
                  <th scope="col">Running</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Other results</th>
                  <th scope="col">Harness failures</th>
                </tr>
              </thead>
              <tbody>
                {models.flatMap((m) =>
                  conditions
                    .filter((c) => count(m, c, () => true))
                    .map((c) => (
                      <tr key={`${m} ${c}`}>
                        <th scope="row">{m}</th>
                        <td>
                          <code>{c}</code>
                        </td>
                        <td>{count(m, c, (s) => s.status === "queued")}</td>
                        <td>{count(m, c, (s) => s.status === "running")}</td>
                        <td>{count(m, c, (s) => s.outcome === "completed")}</td>
                        <td>{count(m, c, (s) => s.status === "finished" && s.outcome !== "completed")}</td>
                        <td>{count(m, c, (s) => s.status === "harness-failed")}</td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="runner">
        <h2 id="runner">Run</h2>
        <p>
          Runs play in this tab and stop while it is hidden: browsers slow hidden tabs down. The
          key stays in this page&apos;s memory and goes only to OpenRouter. Use a key with a
          credit limit, and delete it when you are done.
        </p>
        {hidden && active > 0 && <p className="error">This tab is hidden: runs wait until it is visible again.</p>}
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
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
            <input type="number" min={1} max={4} value={workers} onChange={(e) => setWorkers(Number(e.target.value))} disabled={active > 0} />
          </label>
          {active > 0 ? (
            <button type="button" onClick={() => (stopping.current = true)}>
              Stop after the current runs
            </button>
          ) : (
            <button type="submit">Start</button>
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
