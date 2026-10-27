"use client";
/**
 * Model runs from the operator's tab (docs/model-runs.md), as a to-do list. Each model on the
 * list shows every reasoning level its OpenRouter listing offers; the levels switched on run
 * on every live challenge revision with the current harness, a fixed number of tries, never
 * more. Go makes the queue exactly what is still missing and works through it in this tab,
 * through the real practice session. Safe to press any time. The OpenRouter key lives only in this component's memory:
 * never stored, never sent anywhere but OpenRouter, never recorded.
 */
import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../../../../../packages/content/model";
import type { Json } from "../../../../../packages/domain/json";
import type { Claimed, Coverage, Target } from "../../../../../packages/model-runs/ledger";
import { requestFor } from "../../../../../packages/model-runs/admin";
import { effortOf, estimate, summarize, type TargetCoverage } from "../../../../../packages/model-runs/coverage";
import { OPENROUTER } from "../../../../../packages/model-runs/openrouter";
import { BrowserPractice } from "../../../../../packages/model-runs/practice";
import { runModel } from "../../../../../packages/model-runs/run";

interface Overview {
  harnessVersion: string;
  tries: number;
  live: string[];
  models: string[];
  targets: Target[];
  coverage: Coverage[];
  recent: Record<string, string | number | null>[];
}

/** What OpenRouter lists about a model: what the page needs of it. */
interface Listed {
  name: string;
  supported: string[];
  efforts: string[];
  defaultEffort: string | null;
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
      reasoning?: { supported_efforts?: string[]; default_effort?: string };
      pricing?: { prompt?: string; completion?: string };
    }[];
    const listed = new Map(
      data.map((m) => [
        m.id,
        {
          name: m.name,
          supported: m.supported_parameters,
          efforts: m.reasoning?.supported_efforts ?? [],
          defaultEffort: m.reasoning?.default_effort ?? null,
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

  const change = (body: Record<string, string>) => act(() => post("/admin/api/model-runs/roster", body));

  /** Adds a model with only its default reasoning level running. */
  const addModel = (id: string) =>
    act(async () => {
      await post("/admin/api/model-runs/roster", { action: "add-model", model: id });
      const listed = listing.get(id) ?? (await loadListing()).get(id);
      await post("/admin/api/model-runs/roster", {
        action: "run",
        model: id,
        effort: listed?.efforts.length ? (listed.defaultEffort ?? listed.efforts[0]) : "default",
      });
    });

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
          `→ ${result.outcome}${result.reason ? ` (${result.reason})` : ""}, ${result.turns} turns, ${result.submissions} submissions, ${money(cost)}`,
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
  const running = rows.filter((r) => r.current && r.onRoster);
  const todo = running.reduce((n, r) => n + r.todo, 0);
  const target = running.length * (overview?.live.length ?? 0) * tries;
  const left = estimate(running);
  const spentAll = rows.reduce((n, r) => n + r.spent, 0);
  const models = [...new Set([...(overview?.models ?? []), ...rows.map((r) => r.model)])];

  return (
    <>
      <h1>Benchmarks</h1>
      <p>
        Every model on the list plays every live challenge at each reasoning level switched on, {tries}{" "}
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
        {overview && (
          <dl className="admin-todo">
            <div>
              <dt>Runs left</dt>
              <dd>
                {todo.toLocaleString()} <span className="faint">of {target.toLocaleString()} · {percent(target - todo, target)} done</span>
              </dd>
            </div>
            <div>
              <dt>Cost to finish</dt>
              <dd>
                {todo ? about(left.cost) : money(0)}
                {left.unknown > 0 && <span className="faint"> + {left.unknown} runs not yet estimable</span>}
              </dd>
            </div>
            <div>
              <dt>Time to finish</dt>
              <dd>
                {todo ? `≈ ${duration(left.seconds / Math.max(1, workers))}` : "–"}{" "}
                <span className="faint">at {workers} at a time</span>
              </dd>
            </div>
            <div>
              <dt>Spent so far</dt>
              <dd>
                {money(spentAll)} <span className="faint">full run {about(spentAll + left.cost)}</span>
              </dd>
            </div>
          </dl>
        )}
        <p className="faint">
          Go queues what is missing, drops waiting runs no longer needed, and runs the rest in this tab. Finished
          runs are never repeated, so press it whenever. Runs wait while the tab is hidden. The key stays in this
          page&apos;s memory and goes only to OpenRouter: use one with a credit limit. Estimates come from each
          level&apos;s finished runs, or its model&apos;s other levels until it has some.
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
          {active > 0 ? `${active} running.` : "Not running."} Spent this session: {money(spent)}.
        </p>
        {log.length > 0 && (
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
        )}
      </section>

      <section aria-labelledby="models">
        <h2 id="models">Models</h2>
        {models.map((m) => (
          <ModelCard
            key={m}
            model={m}
            listed={listing.get(m)}
            onList={overview?.models.includes(m) ?? false}
            rows={rows.filter((r) => r.model === m)}
            live={overview?.live.length ?? 0}
            tries={tries}
            workers={workers}
            onChange={(body) => change({ model: m, ...body })}
            onAddBack={() => addModel(m)}
          />
        ))}
        <form
          className="admin-stats-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void addModel(model.trim());
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
          <button type="submit">Add model</button>
        </form>
        <p className="faint">A new model runs its default reasoning level; switch on the others in its card.</p>
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
                  <th scope="col">Level</th>
                  <th scope="col">Challenge</th>
                  <th scope="col">Result</th>
                  <th scope="col">Turns</th>
                  <th scope="col">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((r) => (
                  <tr key={String(r.run_id)}>
                    <td>{new Date(String(r.started_at)).toLocaleString()}</td>
                    <td>{String(r.model)}</td>
                    <td>{effortOf(String(r.condition))}</td>
                    <td>
                      {String(r.challenge_key)} <span className="faint">try {String(r.try)}</span>
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

const LEVEL_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "default"];

function money(usd: number): string {
  if (usd > 0 && usd < 0.01) return "under $0.01";
  return `$${usd.toFixed(2)}`;
}

/** An estimate: "≈ $1.20", or "under $0.01". */
function about(usd: number): string {
  return usd > 0 && usd < 0.01 ? money(usd) : `≈ ${money(usd)}`;
}

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.round(hours / 24)} days`;
}

/**
 * One model, collapsed to a summary line; open, every reasoning level its listing offers (the
 * model's default tagged), each with its coverage and a switch, and earlier harness versions
 * dimmed beneath.
 */
function ModelCard({
  model,
  listed,
  onList,
  rows,
  live,
  tries,
  workers,
  onChange,
  onAddBack,
}: {
  model: string;
  listed: Listed | undefined;
  onList: boolean;
  rows: TargetCoverage[];
  live: number;
  tries: number;
  workers: number;
  onChange(body: Record<string, string>): Promise<unknown>;
  onAddBack(): void;
}) {
  // A switch shows its new state at once, and settles when the ledger answers.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toggle = async (effort: string, running: boolean) => {
    setPending((p) => ({ ...p, [effort]: !running }));
    try {
      await onChange({ action: running ? "stop" : "run", effort });
    } finally {
      setPending(({ [effort]: _, ...rest }) => rest);
    }
  };
  const offered = listed ? (listed.efforts.length ? listed.efforts : ["default"]) : [];
  const levels = [...new Set([...offered, ...rows.map((r) => r.effort)])].sort(
    (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
  );
  const current = (effort: string) => rows.find((r) => r.current && r.effort === effort);
  const on = rows.filter((r) => r.current && r.onRoster);
  const left = estimate(on);
  const todo = on.reduce((n, r) => n + r.todo, 0);
  const covered = on.reduce((n, r) => n + r.covered, 0);
  const spent = rows.reduce((n, r) => n + r.spent, 0);
  const isDefault = (effort: string) =>
    listed ? (listed.efforts.length ? effort === listed.defaultEffort : effort === "default") : false;
  return (
    <details className="admin-model">
      <summary>
        <span className="admin-model-name">
          <code>{model}</code>
          {listed && <span className="faint"> · {listed.name}</span>}
        </span>
        <span className="admin-model-facts">
          {!onList ? (
            "not on the list"
          ) : on.length ? (
            <>
              {on.length} of {levels.length} levels on · {percent(covered, on.length * live)} covered · {todo} runs left
              {todo > 0 &&
                left.unknown < todo &&
                ` · ${about(left.cost)} and ≈ ${duration(left.seconds / Math.max(1, workers))} to finish`}
            </>
          ) : (
            "no levels on"
          )}
          {spent > 0 && ` · ${money(spent)} spent`}
        </span>
      </summary>
      <p className="faint">
        {listed && Number.isFinite(listed.prompt)
          ? `$${listed.prompt.toFixed(2)} in / $${listed.completion.toFixed(2)} out per million tokens now. `
          : listed
            ? ""
            : "Not in OpenRouter's list now. "}
        {tries === 1
          ? "A challenge is covered once its run has finished."
          : `A challenge is covered once all ${tries} tries have finished.`}
      </p>
      <div className="admin-inventory" role="region" aria-label={`${model} reasoning levels`} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Runs</th>
              <th scope="col">Reasoning level</th>
              <th scope="col">Challenges covered</th>
              <th scope="col">Finished</th>
              <th scope="col">Completed</th>
              <th scope="col">Waiting</th>
              <th scope="col">To do</th>
              <th scope="col">Spent</th>
              <th scope="col">To finish</th>
            </tr>
          </thead>
          <tbody>
            {levels.flatMap((effort) => {
              const r = current(effort);
              const running = !!r?.onRoster;
              const earlier = rows.filter((x) => !x.current && x.effort === effort);
              return [
                <tr key={effort} className={running ? undefined : "faint"}>
                  <td>
                    <input
                      type="checkbox"
                      checked={pending[effort] ?? running}
                      disabled={(!onList && !running) || effort in pending}
                      aria-label={`Run ${model} at ${effort}`}
                      onChange={() => void toggle(effort, running)}
                    />
                  </td>
                  <th scope="row">
                    {effort === "default" && !listed?.efforts.length ? "no reasoning setting" : effort}
                    {isDefault(effort) && <span className="admin-tag">default</span>}
                    {listed && !offered.includes(effort) && <span className="faint"> (no longer offered)</span>}
                  </th>
                  <td>
                    <meter min={0} max={live} value={r?.covered ?? 0} aria-label={`${effort} coverage`} /> {r?.covered ?? 0} /{" "}
                    {live}
                    {r && r.started > r.covered && <span className="faint"> ({r.started} started)</span>}
                  </td>
                  <td>{r?.finished ?? 0}</td>
                  <td>
                    {r?.completed ?? 0}{" "}
                    {r && r.finished > 0 && <span className="faint">({percent(r.completed, r.finished)})</span>}
                  </td>
                  <td>
                    {r?.waiting ?? 0}
                    {r && r.harnessFailures > 0 && <span className="faint"> ({r.harnessFailures} failed, to retry)</span>}
                    {r && r.waiting > 0 && !running && <span className="faint"> (dropped at the next Go)</span>}
                  </td>
                  <td>{r?.todo ?? 0}</td>
                  <td>{money(r?.spent ?? 0)}</td>
                  <td>
                    {r && r.todo > 0
                      ? r.costPerRun === null
                        ? "after its first run"
                        : `${about(r.costPerRun * r.todo)}${r.estimatedFrom === "model" ? " (from other levels)" : ""}`
                      : running
                        ? "done"
                        : ""}
                  </td>
                </tr>,
                ...earlier.map((x) => (
                  <tr key={`${effort} ${x.harnessVersion}`} className="faint">
                    <td />
                    <td>
                      ↳ <code>{x.harnessVersion}</code> (earlier)
                    </td>
                    <td>
                      {x.covered} / {live}
                    </td>
                    <td>{x.finished}</td>
                    <td>{x.completed}</td>
                    <td>{x.waiting}</td>
                    <td />
                    <td>{money(x.spent)}</td>
                    <td />
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p>
        {onList ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Take ${model} off the list? Its waiting runs go; finished runs stay.`))
                onChange({ action: "remove-model" });
            }}
          >
            Take off the list
          </button>
        ) : (
          <button type="button" onClick={onAddBack}>
            Put back on the list
          </button>
        )}
      </p>
    </details>
  );
}
