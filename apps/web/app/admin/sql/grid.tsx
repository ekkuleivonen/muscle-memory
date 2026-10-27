"use client";
/**
 * Returned rows as a grid: sticky header, resizable columns, only the visible rows rendered.
 * Sorting and filtering work on the rows R2 SQL returned, and say so. NULL, empty text and
 * JSON are shown as what they are; long values open in the inspector.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Column } from "../../../../../packages/workbench/read";
import { compareValues, plain, structured, toCsv, toJson, toTsv } from "../../../../../packages/workbench/export";

const ROW = 26;
const OVERSCAN = 12;
const MAX_INITIAL = 360;

const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

function initialWidth(column: Column, rows: readonly unknown[][], index: number): number {
  let chars = column.name.length + Math.min(column.type?.length ?? 0, 14) + 3;
  for (let r = 0; r < Math.min(rows.length, 200); r++) {
    const v = rows[r][index];
    chars = Math.max(chars, Math.min(plain(v).length, 60));
  }
  return Math.min(MAX_INITIAL, Math.max(64, chars * 7.8 + 22));
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="sql-null">NULL</span>;
  if (value === "") return <span className="sql-empty">empty</span>;
  if (typeof value === "number")
    return <span className="sql-number">{Math.abs(value) >= 10000 ? numbers.format(value) : String(value)}</span>;
  if (typeof value === "boolean") return <span className="sql-bool">{String(value)}</span>;
  const parsed = structured(value);
  if (parsed) {
    const size = Array.isArray(parsed) ? `[${parsed.length}]` : `{${Object.keys(parsed).length}}`;
    return (
      <span className="sql-json">
        <b>{size}</b> {plain(value).slice(0, 120)}
      </span>
    );
  }
  const text = plain(value);
  return <>{text.length > 300 ? text.slice(0, 300) + "…" : text}</>;
}

function JsonTree({ value, depth = 0, name }: { value: unknown; depth?: number; name?: string }) {
  const label = name !== undefined ? <span className="sql-key">{name}: </span> : null;
  if (value && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    const shown = entries.slice(0, 500);
    return (
      <details open={depth < 6 && entries.length <= 50}>
        <summary>
          {label}
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </summary>
        <div className="sql-tree-children">
          {shown.map(([k, v]) => (
            <JsonTree key={k} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > shown.length && <p className="sql-dim">{entries.length - shown.length} more not shown</p>}
        </div>
      </details>
    );
  }
  return (
    <div className="sql-leaf">
      {label}
      {value === null ? (
        <span className="sql-null">null</span>
      ) : typeof value === "string" ? (
        <span className="sql-string">{JSON.stringify(value)}</span>
      ) : (
        <span className="sql-number">{String(value)}</span>
      )}
    </div>
  );
}

export interface Selected {
  row: number;
  column: number;
}

async function copy(text: string, say: (m: string) => void, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    say(`Copied ${what}.`);
  } catch {
    say("The browser did not allow copying.");
  }
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResultGrid({
  columns,
  rows,
  capped,
  say,
}: {
  columns: Column[];
  rows: unknown[][];
  /** Whether the returned rows may not be everything the query matches. */
  capped: boolean;
  say: (message: string) => void;
}) {
  const [widths, setWidths] = useState<number[]>(() => columns.map((c, i) => initialWidth(c, rows, i)));
  const [sort, setSort] = useState<{ column: number; dir: 1 | -1 } | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [inspect, setInspect] = useState(false);
  const [scroll, setScroll] = useState({ top: 0, height: 400 });
  const body = useRef<HTMLDivElement>(null);

  const view = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    let order = rows.map((_, i) => i);
    if (needle) order = order.filter((i) => rows[i].some((v) => plain(v).toLowerCase().includes(needle)));
    if (sort) order.sort((a, b) => compareValues(rows[a][sort.column], rows[b][sort.column]) * sort.dir || a - b);
    return order;
  }, [rows, filter, sort]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const update = () => setScroll({ top: el.scrollTop, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = widths.reduce((a, b) => a + b, 0);
  const template = widths.map((w) => `${Math.round(w)}px`).join(" ");
  const first = Math.max(0, Math.floor(scroll.top / ROW) - OVERSCAN);
  const last = Math.min(view.length, Math.ceil((scroll.top + scroll.height) / ROW) + OVERSCAN);
  const current = selected && selected.row < view.length ? rows[view[selected.row]] : null;
  const value = current && selected ? current[selected.column] : undefined;

  function select(next: Selected) {
    const row = Math.max(0, Math.min(view.length - 1, next.row));
    const column = Math.max(0, Math.min(columns.length - 1, next.column));
    setSelected({ row, column });
    const el = body.current;
    if (el) {
      const top = row * ROW;
      // The header is sticky inside the scroller, one row tall.
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW * 2 > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW * 2 - el.clientHeight;
      const left = widths.slice(0, column).reduce((a, b) => a + b, 0);
      const right = left + widths[column];
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    }
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!view.length) return;
    const at = selected ?? { row: 0, column: 0 };
    const page = Math.max(1, Math.floor((body.current?.clientHeight ?? 400) / ROW) - 2);
    const moves: Record<string, Selected> = {
      ArrowDown: { row: at.row + 1, column: at.column },
      ArrowUp: { row: at.row - 1, column: at.column },
      ArrowRight: { row: at.row, column: at.column + 1 },
      ArrowLeft: { row: at.row, column: at.column - 1 },
      PageDown: { row: at.row + page, column: at.column },
      PageUp: { row: at.row - page, column: at.column },
      Home: { row: event.ctrlKey || event.metaKey ? 0 : at.row, column: 0 },
      End: { row: event.ctrlKey || event.metaKey ? view.length - 1 : at.row, column: columns.length - 1 },
    };
    if (moves[event.key]) {
      event.preventDefault();
      select(moves[event.key]);
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      setInspect(true);
    } else if (event.key === "Escape" && inspect) {
      setInspect(false);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selected && current) {
      event.preventDefault();
      if (event.shiftKey) void copy(toTsv(columns.map((c) => c.name), [current]), say, "the row");
      else void copy(plain(value), say, "the cell");
    }
  }

  function resize(event: PointerEvent<HTMLSpanElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientX;
    const startWidth = widths[index];
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) =>
      setWidths((w) => w.map((x, i) => (i === index ? Math.max(48, startWidth + e.clientX - start) : x)));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function autosize(index: number) {
    let chars = columns[index].name.length + 2;
    for (const i of view.slice(0, 2000)) chars = Math.max(chars, Math.min(plain(rows[i][index]).length, 200));
    setWidths((w) => w.map((x, i) => (i === index ? Math.min(1200, chars * 7.8 + 22) : x)));
  }

  const names = columns.map((c) => c.name);
  const shownRows = () => view.map((i) => rows[i]);
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const scope = `${view.length === rows.length ? `${rows.length}` : `${view.length} of ${rows.length}`} returned row${rows.length === 1 ? "" : "s"}`;

  return (
    <div className={`sql-results${inspect && selected ? " inspecting" : ""}`}>
      <div className="sql-grid-tools">
        <label>
          <span className="sql-visually-hidden">Filter returned rows</span>
          <input
            type="search"
            placeholder="Filter returned rows"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <span className="sql-dim" aria-live="polite">
          {scope}
          {sort && ` · sorted by ${columns[sort.column].name} ${sort.dir === 1 ? "↑" : "↓"} here, among these rows`}
          {capped && (sort || filter) && " (not the whole table)"}
        </span>
        <span className="sql-grid-actions">
          <button type="button" onClick={() => void copy(toTsv(names, shownRows()), say, `${view.length} rows as TSV`)}>
            Copy rows
          </button>
          <button
            type="button"
            onClick={() => {
              download(`muscle-memory-sql-${stamp()}.csv`, "text/csv;charset=utf-8", toCsv(names, shownRows()));
              say(`Exported ${view.length} rows as CSV.`);
            }}
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              download(`muscle-memory-sql-${stamp()}.json`, "application/json", toJson(names, shownRows()));
              say(`Exported ${view.length} rows as JSON.`);
            }}
          >
            JSON
          </button>
        </span>
      </div>
      <div className="sql-grid-and-inspector">
        <div
          ref={body}
          className="sql-grid"
          role="grid"
          aria-label="Query results"
          aria-rowcount={view.length + 1}
          aria-colcount={columns.length}
          tabIndex={0}
          onKeyDown={onKey}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        >
          <div className="sql-row sql-head" role="row" aria-rowindex={1} style={{ gridTemplateColumns: template }}>
            {columns.map((c, i) => (
              <div
                key={i}
                role="columnheader"
                aria-colindex={i + 1}
                aria-sort={sort?.column === i ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className="sql-cell"
              >
                <button
                  type="button"
                  className="sql-sort"
                  title={`Sort the returned rows by ${c.name}`}
                  onClick={() =>
                    setSort((s) =>
                      s?.column !== i ? { column: i, dir: 1 } : s.dir === 1 ? { column: i, dir: -1 } : null,
                    )
                  }
                >
                  <span className="sql-colname">{c.name}</span>
                  {c.type && <span className="sql-type">{c.type}</span>}
                  <span aria-hidden="true">{sort?.column === i ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</span>
                </button>
                <span
                  className="sql-resize"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${c.name}`}
                  title="Drag to resize; double-click to fit"
                  onPointerDown={(e) => resize(e, i)}
                  onDoubleClick={() => autosize(i)}
                />
              </div>
            ))}
          </div>
          <div style={{ height: view.length * ROW, width: total, position: "relative" }} role="rowgroup">
            {view.slice(first, last).map((index, k) => {
              const r = first + k;
              return (
                <div
                  key={index}
                  role="row"
                  aria-rowindex={r + 2}
                  className="sql-row"
                  style={{ gridTemplateColumns: template, transform: `translateY(${r * ROW}px)` }}
                >
                  {columns.map((_, c) => {
                    const isSelected = selected?.row === r && selected.column === c;
                    return (
                      <div
                        key={c}
                        role="gridcell"
                        aria-colindex={c + 1}
                        aria-selected={isSelected}
                        className={`sql-cell${typeof rows[index][c] === "number" ? " num" : ""}${isSelected ? " selected" : ""}`}
                        onClick={() => setSelected({ row: r, column: c })}
                        onDoubleClick={() => {
                          setSelected({ row: r, column: c });
                          setInspect(true);
                        }}
                      >
                        <Cell value={rows[index][c]} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {!view.length && (
            <p className="sql-grid-empty">{rows.length ? "No returned row matches the filter." : "No rows."}</p>
          )}
        </div>
        {inspect && selected && current && (
          <aside className="sql-inspector" aria-label="Value inspector">
            <header>
              <strong>{columns[selected.column].name}</strong>
              <span className="sql-dim"> row {selected.row + 1}</span>
              <button type="button" onClick={() => setInspect(false)} aria-label="Close the inspector">
                ✕
              </button>
            </header>
            <p className="sql-dim">
              {columns[selected.column].type ?? "type not reported"} ·{" "}
              {value === null || value === undefined
                ? "NULL"
                : typeof value === "string"
                  ? `text, ${value.length} characters`
                  : typeof value}
            </p>
            <div className="sql-inspector-actions">
              <button type="button" onClick={() => void copy(plain(value), say, "the value")}>
                Copy value
              </button>
              <button type="button" onClick={() => void copy(toJson(names, [current]), say, "the row as JSON")}>
                Copy row (JSON)
              </button>
            </div>
            {structured(value) ? (
              <div className="sql-tree">
                <JsonTree value={structured(value)} />
              </div>
            ) : (
              <pre className="sql-value">{value === null || value === undefined ? "NULL" : plain(value)}</pre>
            )}
          </aside>
        )}
      </div>
      <p className="sql-dim sql-grid-help">
        Arrow keys move, Enter or double-click inspects, Ctrl/⌘-C copies the cell (with Shift, the row). Sorting,
        filtering, copying and exports cover only the {rows.length} returned row{rows.length === 1 ? "" : "s"}
        {view.length !== rows.length ? `, ${view.length} after the filter` : ""}.
      </p>
    </div>
  );
}
