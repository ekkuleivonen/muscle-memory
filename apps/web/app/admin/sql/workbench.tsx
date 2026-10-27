"use client";
/**
 * The SQL workbench (docs/admin-sql.md): an editor with the live schema, one read-only query
 * at a time on explicit Run, and the returned rows in a grid. Drafts and the query history
 * (SQL text and counts, never rows) stay in this browser's localStorage; results live only in
 * memory.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "@codemirror/state";
import type { QueryFailure, QueryResult, Schema } from "../../../../../packages/workbench/read";
import { ENGINE_DEFAULT_LIMIT } from "../../../../../packages/workbench/read";
import { statements } from "../../../../../packages/workbench/sql";
import { formatSql } from "../../../../../packages/workbench/format";
import { formatBytes } from "../../../../../packages/workbench/export";
import { COLUMN_HINTS, EXAMPLES } from "./examples";
import { ResultGrid } from "./grid";
import type { SqlEditor } from "./sql-editor";

interface Tab {
  id: string;
  name: string;
  sql: string;
}
interface Ran {
  sql: string;
  at: string;
  status: "ok" | "error" | "cancelled";
  rows?: number;
  ms?: number;
}
interface Saved {
  v: 1;
  tabs: Tab[];
  active: string;
  history: Ran[];
}
interface Target {
  sql: string;
  /** Offset of `sql` in the document, for error marks. */
  base: number;
  lines: string;
  tab: string;
}
type Run =
  | { status: "idle" }
  | { status: "running"; id: number; target: Target; started: number }
  | { status: "done"; id: number; target: Target; result: QueryResult; ms: number; at: Date }
  | { status: "error"; id: number; target: Target; failure: QueryFailure | { kind: "busy" | "network"; message: string }; at: Date }
  | { status: "cancelled"; target: Target; ms: number; at: Date };

const STORE = "mm-admin-sql-v1";
const SCHEMA_STORE = "mm-admin-sql-schema-v1";
const MAX_TABS = 12;
const MAX_HISTORY = 60;
const FIRST: Tab = {
  id: "t1",
  name: "Query 1",
  sql: "-- Ctrl/⌘-Enter runs the statement at the cursor, or the selection.\nSELECT type, COUNT(DISTINCT record_id) AS records\nFROM default.events\nGROUP BY type\nORDER BY records DESC\nLIMIT 20",
};

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the draft stays in memory. */
  }
}
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
const sinceLiteral = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

function linesOf(doc: string, from: number, to: number) {
  const a = doc.slice(0, from).split("\n").length;
  const b = doc.slice(0, to).split("\n").length;
  return a === b ? `line ${a}` : `lines ${a}–${b}`;
}

export function Workbench({
  limits,
}: {
  limits: { maxRows: number; timeoutMs: number; maxBytes: number; configured: boolean };
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<SqlEditor | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const [tabs, setTabs] = useState<Tab[]>([FIRST]);
  const [active, setActive] = useState(FIRST.id);
  const [history, setHistory] = useState<Ran[]>([]);
  const [ready, setReady] = useState(false);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const [queued, setQueued] = useState<Target | null>(null);
  const [stale, setStale] = useState(false);
  const [selection, setSelection] = useState(false);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaState, setSchemaState] = useState<"idle" | "loading" | "error">("idle");
  const [schemaError, setSchemaError] = useState("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [panel, setPanel] = useState<"schema" | "examples" | "history">("schema");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(active);
  activeRef.current = active;
  const historyRef = useRef(history);
  historyRef.current = history;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Writes drafts now: the editor's text goes into its tab first. */
  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const doc = editor.current?.view.state.doc.toString();
    const list = tabsRef.current.map((t) => (t.id === activeRef.current && doc !== undefined ? { ...t, sql: doc } : t));
    save(STORE, { v: 1, tabs: list, active: activeRef.current, history: historyRef.current } satisfies Saved);
  }, []);

  const say = useCallback((message: string) => setNotice(message), []);

  const loadSchema = useCallback(async () => {
    setSchemaState("loading");
    setSchemaError("");
    try {
      const response = await fetch("/admin/api/sql/schema", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.tables) throw new Error(body?.error?.message ?? `The schema could not be read (${response.status}).`);
      setSchema(body as Schema);
      save(SCHEMA_STORE, body);
      setSchemaState("idle");
    } catch (cause) {
      setSchemaState("error");
      setSchemaError(cause instanceof Error ? cause.message : "The schema could not be read.");
    }
  }, []);

  const start = useCallback(
    async (target: Target) => {
      const id = ++seq.current;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const started = performance.now();
      editor.current?.clearMarks();
      setStale(false);
      setRun({ status: "running", id, target, started });
      const finish = (next: Run, ran: Ran) => {
        // A newer run (or a cancel) owns the screen now: drop this answer.
        if (seq.current !== id) return;
        controller.current = null;
        setRun(next);
        setHistory((h) => [ran, ...h.filter((x) => x.sql !== ran.sql)].slice(0, MAX_HISTORY));
        const waiting = queuedRef.current;
        if (waiting) {
          setQueued(null);
          void start(waiting);
        }
      };
      try {
        const response = await fetch("/admin/api/sql/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sql: target.sql }),
          signal: abort.signal,
        });
        const body = await response.json().catch(() => null);
        const ms = performance.now() - started;
        const at = new Date();
        if (response.ok && body?.columns) {
          finish(
            { status: "done", id, target, result: body as QueryResult, ms, at },
            { sql: target.sql, at: at.toISOString(), status: "ok", rows: body.rows.length, ms: Math.round(ms) },
          );
        } else {
          const failure =
            body?.error && typeof body.error.message === "string"
              ? body.error
              : { kind: "network" as const, message: response.status === 403 ? "Operator access is required: the Access session may have ended. Reload the page to sign in again." : `The workbench's server answered ${response.status}.` };
          if (seq.current === id && editor.current) {
            const ed = editor.current;
            const doc = ed.view.state.doc.toString();
            // Marks only make sense while the text is unchanged since it was sent.
            if (doc.slice(target.base, target.base + target.sql.length) === target.sql) {
              if (failure.kind === "rejected") ed.mark(failure.message, failure.at, null, null, target.base);
              else if (failure.kind === "sql") ed.mark(failure.message, null, failure.line, failure.column, target.base);
            }
          }
          finish(
            { status: "error", id, target, failure, at },
            { sql: target.sql, at: at.toISOString(), status: "error", ms: Math.round(ms) },
          );
        }
      } catch {
        if (abort.signal.aborted) return;
        finish(
          { status: "error", id, target, failure: { kind: "network", message: "The request did not complete: the network or the server failed." }, at: new Date() },
          { sql: target.sql, at: new Date().toISOString(), status: "error" },
        );
      }
    },
    [],
  );

  const runNow = useCallback(() => {
    const ed = editor.current;
    if (!ed) return;
    const picked = ed.target();
    if (!picked) {
      say("There is no statement at the cursor.");
      return;
    }
    const doc = ed.view.state.doc.toString();
    // Send exactly the statement, so the engine's line and column match the editor's.
    let sql = picked.text;
    let base = picked.from;
    try {
      const list = statements(picked.text);
      if (list.length === 1) {
        sql = list[0].text;
        base = picked.from + list[0].from;
      }
    } catch {
      /* The server explains what does not tokenize. */
    }
    const target: Target = { sql, base, lines: linesOf(doc, base, base + sql.length), tab: activeRef.current };
    if (runRef.current.status === "running") {
      setQueued(target);
      say(`Queued: runs when the current query finishes (${target.lines}).`);
      return;
    }
    void start(target);
  }, [say, start]);

  const cancel = useCallback(() => {
    const current = runRef.current;
    setQueued(null);
    if (current.status !== "running") return;
    seq.current++;
    controller.current?.abort();
    controller.current = null;
    const ms = performance.now() - current.started;
    setRun({ status: "cancelled", target: current.target, ms, at: new Date() });
    setHistory((h) => [{ sql: current.target.sql, at: new Date().toISOString(), status: "cancelled" as const, ms: Math.round(ms) }, ...h].slice(0, MAX_HISTORY));
  }, []);

  const format = useCallback(() => {
    const ed = editor.current;
    if (!ed) return;
    const { state } = ed.view;
    const range = state.selection.main;
    if (!range.empty) {
      const text = state.sliceDoc(range.from, range.to);
      const formatted = formatSql(text).replace(/\n$/, text.endsWith("\n") ? "\n" : "");
      if (formatted === text) return;
      ed.replaceRange(range.from, range.to, formatted, true);
      return;
    }
    const doc = state.doc.toString();
    const formatted = formatSql(doc);
    if (formatted === doc) {
      if (formatted === doc && doc.trim()) say("Already formatted, or the text has an unclosed string or comment.");
      return;
    }
    ed.replace(formatted);
  }, [say]);

  const hooks = useRef({ runNow, format });
  hooks.current = { runNow, format };

  // Mount: restore drafts, history and the cached schema, then create the editor.
  useEffect(() => {
    let cancelled = false;
    const saved = load<Saved>(STORE);
    const restoredTabs = saved?.v === 1 && Array.isArray(saved.tabs) && saved.tabs.length ? saved.tabs.slice(0, MAX_TABS) : [FIRST];
    const restoredActive = restoredTabs.some((t) => t.id === saved?.active) ? saved!.active : restoredTabs[0].id;
    const cached = load<Schema>(SCHEMA_STORE);
    setTabs(restoredTabs);
    setActive(restoredActive);
    setHistory(Array.isArray(saved?.history) ? saved!.history.slice(0, MAX_HISTORY) : []);
    if (cached?.tables) setSchema(cached);
    tabsRef.current = restoredTabs;
    activeRef.current = restoredActive;
    void import("./sql-editor").then(({ SqlEditor }) => {
      if (cancelled || !host.current) return;
      const doc = restoredTabs.find((t) => t.id === restoredActive)?.sql ?? "";
      editor.current = new SqlEditor(
        host.current,
        doc,
        {
          onChange: () => {
            setStale(true);
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(persist, 400);
          },
          onSelection: (view) => setSelection(!view.state.selection.main.empty),
          onRun: () => hooks.current.runNow(),
          onFormat: () => hooks.current.format(),
        },
        cached?.tables ? cached : null,
      );
      setReady(true);
      editor.current.view.focus();
    });
    // Metadata only; read once when this browser has no copy.
    if (!cached?.tables && limits.configured) void loadSchema();
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flush);
      persist();
      controller.current?.abort();
      editor.current?.destroy();
      editor.current = null;
    };
  }, [limits.configured, loadSchema, persist]);

  useEffect(() => {
    editor.current?.setSchema(schema);
  }, [schema, ready]);

  useEffect(() => {
    if (ready) persist();
  }, [tabs, active, history, ready, persist]);

  useEffect(() => {
    if (run.status !== "running") return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [run.status]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function switchTab(id: string) {
    const ed = editor.current;
    if (!ed || id === activeRef.current) return;
    const doc = ed.view.state.doc.toString();
    states.current.set(activeRef.current, ed.view.state);
    const list = tabsRef.current.map((t) => (t.id === activeRef.current ? { ...t, sql: doc } : t));
    setTabs(list);
    tabsRef.current = list;
    setActive(id);
    activeRef.current = id;
    const kept = states.current.get(id);
    // Each tab keeps its own state, so undo never reaches another tab's text.
    ed.view.setState(kept ?? ed.fresh(list.find((t) => t.id === id)?.sql ?? ""));
    ed.setSchema(schema);
    ed.clearMarks();
    setStale(true);
    ed.view.focus();
  }

  function openTab(sql: string, name?: string) {
    if (tabsRef.current.length >= MAX_TABS) {
      say(`At most ${MAX_TABS} tabs: close one first.`);
      return;
    }
    const used = new Set(tabsRef.current.map((t) => t.name));
    let n = tabsRef.current.length + 1;
    while (used.has(`Query ${n}`)) n++;
    const tab: Tab = { id: newId(), name: name ?? `Query ${n}`, sql };
    const list = [...tabsRef.current, tab];
    setTabs(list);
    tabsRef.current = list;
    switchTab(tab.id);
  }

  function closeTab(id: string) {
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!tab) return;
    const text = id === activeRef.current ? editor.current?.view.state.doc.toString() ?? "" : tab.sql;
    if (text.trim() && !confirm(`Close “${tab.name}”? Its draft is deleted from this browser.`)) return;
    const rest = tabsRef.current.filter((t) => t.id !== id);
    states.current.delete(id);
    if (!rest.length) rest.push({ ...FIRST, id: newId(), sql: "" });
    if (id === activeRef.current) {
      const next = rest[Math.max(0, tabsRef.current.findIndex((t) => t.id === id) - 1)] ?? rest[0];
      setTabs(rest);
      tabsRef.current = rest;
      activeRef.current = "";
      switchTab(next.id);
    } else {
      setTabs(rest);
      tabsRef.current = rest;
    }
  }

  function renameTab(id: string) {
    const tab = tabsRef.current.find((t) => t.id === id);
    const name = tab && prompt("Tab name", tab.name);
    if (!name?.trim()) return;
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, name: name.trim().slice(0, 40) } : t)));
  }

  const elapsed = run.status === "running" ? Math.max(0, now - run.started) : 0;
  const needle = schemaFilter.trim().toLowerCase();
  const visibleTables = (schema?.tables ?? [])
    .map((t) => ({
      table: t,
      columns: needle && !t.name.toLowerCase().includes(needle) ? t.columns.filter((c) => c.name.toLowerCase().includes(needle)) : t.columns,
    }))
    .filter((x) => !needle || x.table.name.toLowerCase().includes(needle) || x.columns.length);
  const result = run.status === "done" ? run.result : null;
  const capped = !!result && (result.truncated || (result.engineLimit && result.received >= ENGINE_DEFAULT_LIMIT));

  return (
    <div className="sql-workbench">
      <div className="sql-title">
        <h1>SQL workbench</h1>
        <p className="sql-dim">
          Read-only R2 SQL over the events bucket (<code>default.*</code>). Results can hold private
          participant data: they stay in this tab and are never stored.
        </p>
      </div>
      {!limits.configured && (
        <p className="sql-warning" role="alert">
          The R2 SQL credential is not configured in this deployment, so queries cannot run.
        </p>
      )}
      <aside className="sql-side" aria-label="Schema, examples and history">
        <div className="sql-panel-tabs" role="tablist" aria-label="Side panel">
          {(["schema", "examples", "history"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={panel === p}
              className={panel === p ? "active" : ""}
              onClick={() => setPanel(p)}
            >
              {p === "schema" ? "Schema" : p === "examples" ? "Examples" : "History"}
            </button>
          ))}
        </div>
        {panel === "schema" && (
          <div className="sql-panel" role="tabpanel" aria-label="Schema">
            <div className="sql-panel-bar">
              <input type="search" placeholder="Filter tables and columns" aria-label="Filter tables and columns" value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)} />
              <button type="button" onClick={() => void loadSchema()} disabled={schemaState === "loading" || !limits.configured}>
                {schemaState === "loading" ? "Reading…" : "Refresh"}
              </button>
            </div>
            {schemaState === "error" && <p className="sql-error-text" role="alert">{schemaError}</p>}
            {schema && (
              <p className="sql-dim sql-small">
                Read {new Date(schema.loadedAt).toLocaleString()} with SHOW TABLES and DESCRIBE (no rows scanned).
                {schema.failed.length > 0 && ` Could not describe: ${schema.failed.join(", ")}.`}
              </p>
            )}
            {!schema && schemaState !== "loading" && <p className="sql-dim">No schema read yet.</p>}
            <ul className="sql-schema">
              {visibleTables.map(({ table, columns }) => (
                <li key={table.name}>
                  <details open={!!needle || (schema?.tables.length ?? 0) <= 3}>
                    <summary>
                      <button type="button" className="sql-insert" title={`Insert ${table.namespace}.${table.name}`} onClick={() => editor.current?.insert(`${table.namespace}.${table.name}`)}>
                        {table.name}
                      </button>
                      <span className="sql-dim"> {table.columns.length} columns</span>
                    </summary>
                    <ul>
                      {columns.map((c) => {
                        const hint = COLUMN_HINTS[`${table.name}.${c.name}`];
                        return (
                          <li key={c.name}>
                            <button type="button" className="sql-insert" title={`Insert ${c.name}`} onClick={() => editor.current?.insert(c.name)}>
                              {c.name}
                            </button>{" "}
                            <span className="sql-type">{c.type}</span>
                            {c.required === false && <span className="sql-dim sql-small"> nullable</span>}
                            {(c.doc || hint) && <p className="sql-dim sql-small">{c.doc ?? hint}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
        {panel === "examples" && (
          <div className="sql-panel" role="tabpanel" aria-label="Examples">
            <p className="sql-dim sql-small">Each opens in a new tab. Nothing runs until you press Run.</p>
            <ul className="sql-list">
              {EXAMPLES.map((e) => (
                <li key={e.title}>
                  <button type="button" className="sql-insert" onClick={() => openTab(e.sql(sinceLiteral()), e.title.slice(0, 40))}>
                    {e.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {panel === "history" && (
          <div className="sql-panel" role="tabpanel" aria-label="History">
            <p className="sql-dim sql-small">
              The last {MAX_HISTORY} queries run in this browser: their text and row counts only.{" "}
              {history.length > 0 && (
                <button type="button" className="sql-link" onClick={() => confirm("Clear this browser's query history?") && setHistory([])}>
                  Clear
                </button>
              )}
            </p>
            <ul className="sql-list sql-history">
              {history.map((h) => (
                <li key={h.at + h.sql}>
                  <button type="button" className="sql-insert" title="Open in a new tab" onClick={() => openTab(h.sql)}>
                    <code>{h.sql.replace(/\s+/g, " ").slice(0, 140)}</code>
                  </button>
                  <span className="sql-dim sql-small">
                    {new Date(h.at).toLocaleString()} · {h.status === "ok" ? `${h.rows} rows` : h.status}
                    {h.ms !== undefined && ` · ${seconds(h.ms)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <section className="sql-main" aria-label="Query">
        <div className="sql-tabs" role="tablist" aria-label="Query tabs">
          {tabs.map((t) => (
            <span key={t.id} className={`sql-tab${t.id === active ? " active" : ""}`}>
              <button type="button" role="tab" aria-selected={t.id === active} onClick={() => switchTab(t.id)} onDoubleClick={() => renameTab(t.id)} title="Double-click to rename">
                {t.name}
              </button>
              <button type="button" className="sql-tab-close" aria-label={`Close ${t.name}`} onClick={() => closeTab(t.id)}>
                ×
              </button>
            </span>
          ))}
          <button type="button" className="sql-tab-new" aria-label="New tab" onClick={() => openTab("")}>
            +
          </button>
        </div>
        <div className="sql-editor" ref={host} />
        <div className="sql-toolbar">
          <button type="button" className="sql-run" onClick={runNow} disabled={!ready || !limits.configured} title="Ctrl/⌘-Enter">
            {run.status === "running" ? (queued ? "Queued…" : "Queue next") : selection ? "Run selection" : "Run statement"}
            <kbd>⌘/Ctrl ↵</kbd>
          </button>
          <button type="button" onClick={cancel} disabled={run.status !== "running"}>
            Stop waiting
          </button>
          <button type="button" onClick={format} disabled={!ready} title="Shift-Alt-F">
            Format <kbd>⇧⌥F</kbd>
          </button>
          <span className="sql-dim sql-small">
            Draft saved in this browser. Up to {limits.maxRows.toLocaleString("en-US")} rows and {Math.round(limits.maxBytes / 1048576)} MiB per answer; waits {limits.timeoutMs / 1000} s.
          </span>
        </div>
        <p className="sql-dim sql-small sql-cost">
          LIMIT caps the rows returned, not the data scanned. R2 SQL bills bytes scanned (at least 10 MB a query), so filter and aggregate in the query.
        </p>
        <div className="sql-status" role="status" aria-live="polite">
          {run.status === "idle" && <span className="sql-dim">Nothing has run yet. Queries run only when you press Run.</span>}
          {run.status === "running" && (
            <span>
              <span className="sql-spinner" aria-hidden="true" /> Running the statement on {run.target.lines}… {seconds(elapsed)}
              {queued && <> · then {queued.lines}</>}
            </span>
          )}
          {run.status === "cancelled" && (
            <span className="sql-warning-text">
              Stopped waiting after {seconds(run.ms)}. R2 SQL cannot cancel a query: it may still run to the end and bill what it scans. Its answer, if any, is ignored.
            </span>
          )}
          {run.status === "error" && (
            <span className="sql-error-text">
              {run.failure.kind === "rejected" ? "Not run: " : run.failure.kind === "sql" ? "R2 SQL error: " : ""}
              <span className="sql-pre">{run.failure.message}</span>
            </span>
          )}
          {result && run.status === "done" && (
            <span>
              <strong>{result.rows.length.toLocaleString("en-US")}</strong> row{result.rows.length === 1 ? "" : "s"} ·{" "}
              {seconds(run.ms)} ({seconds(result.elapsedMs)} in R2 SQL) ·{" "}
              {result.scan
                ? `scanned ${formatBytes(result.scan.bytes)}${result.scan.files !== null ? ` in ${result.scan.files} file${result.scan.files === 1 ? "" : "s"}` : ""}`
                : "no scan figures reported"}{" "}
              · {run.target.lines} at {run.at.toLocaleTimeString()}
              {stale && <span className="sql-stale"> · the editor has changed since</span>}
            </span>
          )}
          {notice && <span className="sql-notice"> {notice}</span>}
        </div>
        {result && run.status === "done" && (
          <>
            {(result.truncated || (result.engineLimit && result.received >= ENGINE_DEFAULT_LIMIT) || result.duplicateNames.length > 0) && (
              <ul className="sql-warnings">
                {result.truncated && (
                  <li>
                    R2 SQL returned {result.received.toLocaleString("en-US")} rows; the workbench keeps the first {result.maxRows.toLocaleString("en-US")}. Add a LIMIT or aggregate.
                  </li>
                )}
                {result.engineLimit && result.received >= ENGINE_DEFAULT_LIMIT && (
                  <li>
                    No LIMIT on the query, and R2 SQL returns at most {ENGINE_DEFAULT_LIMIT} rows without one: there may be more. Add LIMIT (up to {result.maxRows.toLocaleString("en-US")}) to see them.
                  </li>
                )}
                {result.duplicateNames.length > 0 && (
                  <li>Columns named more than once ({result.duplicateNames.join(", ")}) show one value each; give them distinct aliases.</li>
                )}
              </ul>
            )}
            {result.columns.length ? (
              <ResultGrid key={run.id} columns={result.columns} rows={result.rows} capped={capped} say={say} />
            ) : (
              <p className="sql-dim">The statement ran and returned no columns.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
