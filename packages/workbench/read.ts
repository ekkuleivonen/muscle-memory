/**
 * The workbench's server side (docs/admin-sql.md): checked SQL to R2 SQL over the events
 * bucket only, bounded in time, rows and bytes, and projected to what the page shows. The
 * upstream body is never logged; SQL errors go back to the operator who wrote the query.
 */
import { checkQuery, NAMESPACE, SqlRejected, type CheckedQuery } from "./sql";

/** The events bucket's warehouse. The URL fixes the bucket: no other bucket is reachable. */
export const SQL_ENDPOINT =
  "https://api.sql.cloudflarestorage.com/api/v1/accounts/166fd3dff06a9c3f1aef172a25db7ace/basin-sql/query/muscle-memory-events";

/** R2 SQL's own LIMIT when a query sets none. */
export const ENGINE_DEFAULT_LIMIT = 500;

export interface Limits {
  maxRows: number;
  timeoutMs: number;
  maxBytes: number;
  maxLength: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxRows: 5000,
  timeoutMs: 30000,
  maxBytes: 8 * 1024 * 1024,
  maxLength: 20000,
};

/** Optional overrides from the Worker's vars, each clamped to a sane range. */
export function limitsFrom(env: Record<string, unknown>): Limits {
  const pick = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(env[name]);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
  };
  return {
    maxRows: pick("SQL_WORKBENCH_MAX_ROWS", DEFAULT_LIMITS.maxRows, 1, 50000),
    timeoutMs: pick("SQL_WORKBENCH_TIMEOUT_MS", DEFAULT_LIMITS.timeoutMs, 1000, 120000),
    maxBytes: pick("SQL_WORKBENCH_MAX_BYTES", DEFAULT_LIMITS.maxBytes, 64 * 1024, 32 * 1024 * 1024),
    maxLength: DEFAULT_LIMITS.maxLength,
  };
}

export interface Column {
  name: string;
  /** The type R2 SQL reported, as text; null when it reported none. */
  type: string | null;
}

export interface QueryResult {
  columns: Column[];
  /** Values in column order, as R2 SQL returned them in JSON. */
  rows: unknown[][];
  /** Rows R2 SQL returned, before this workbench's own cap. */
  received: number;
  /** More rows came back than `maxRows`; only the first `maxRows` are here. */
  truncated: boolean;
  maxRows: number;
  /** The outermost query sets no LIMIT, so R2 SQL returns at most ENGINE_DEFAULT_LIMIT rows. */
  engineLimit: boolean;
  /** Column names R2 SQL returned twice; their rows hold only one of the values. */
  duplicateNames: string[];
  /** From the response, when it carries them as numbers. */
  scan: { bytes: number; files: number | null } | null;
  /** Time from sending to the whole response, on the server. */
  elapsedMs: number;
  kind: CheckedQuery["kind"];
}

export type QueryFailure =
  | { kind: "rejected"; message: string; at: number | null }
  | { kind: "sql"; message: string; line: number | null; column: number | null }
  | { kind: "timeout"; message: string }
  | { kind: "too-large"; message: string }
  | { kind: "unavailable"; message: string };

export class QueryFailed extends Error {
  constructor(readonly failure: QueryFailure) {
    super(failure.message);
  }
}

function typeText(field: Record<string, unknown>): string | null {
  const type = field.type ?? field.data_type ?? field.dataType ?? field.arrow_type;
  if (typeof type === "string") return type;
  if (type && typeof type === "object") return JSON.stringify(type);
  return null;
}

/** Projects R2 SQL's `result` to columns and rows; extra fields never pass through. */
export function projectResult(
  result: unknown,
  checked: CheckedQuery,
  maxRows: number,
  elapsedMs: number,
): QueryResult {
  const r = (result ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(r.rows) ? r.rows : [];
  const schema = Array.isArray(r.schema) ? r.schema : [];
  let columns: Column[] = schema
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && typeof (f as any).name === "string")
    .map((f) => ({ name: f.name as string, type: typeText(f) }));
  if (!columns.length && rawRows.length && rawRows[0] && typeof rawRows[0] === "object")
    columns = Object.keys(rawRows[0] as object).map((name) => ({ name, type: null }));
  const seen = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const c of columns) (seen.has(c.name) ? duplicateNames : seen).add(c.name);
  const rows = rawRows.slice(0, maxRows).map((row) => {
    const value = (row ?? {}) as Record<string, unknown>;
    return columns.map((c) => (Object.hasOwn(value, c.name) ? value[c.name] : null));
  });
  const metrics = (r.metrics ?? {}) as Record<string, unknown>;
  const bytes = metrics.bytes_scanned;
  const files = metrics.files_scanned;
  return {
    columns,
    rows,
    received: rawRows.length,
    truncated: rawRows.length > maxRows,
    maxRows,
    engineLimit: !checked.limited,
    duplicateNames: [...duplicateNames],
    scan:
      typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0
        ? { bytes, files: typeof files === "number" && Number.isFinite(files) ? files : null }
        : null,
    elapsedMs,
    kind: checked.kind,
  };
}

/** Where the engine says an error is, when its message says (sqlparser: "Line: 1, Column: 8"). */
export function errorPlace(message: string): { line: number | null; column: number | null } {
  const m = /line:?\s*(\d+),\s*column:?\s*(\d+)/i.exec(message);
  return m ? { line: Number(m[1]), column: Number(m[2]) } : { line: null, column: null };
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new QueryFailed({
        kind: "too-large",
        message: `The response passed ${Math.round(maxBytes / 1048576)} MiB, so it was dropped. Select fewer columns or rows (LIMIT), or aggregate.`,
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Sends one checked statement. `signal` is the browser's request: closing it stops waiting. */
export async function runQuery(
  token: string,
  text: string,
  limits: Limits = DEFAULT_LIMITS,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<QueryResult> {
  let checked: CheckedQuery;
  try {
    checked = checkQuery(text, limits.maxLength);
  } catch (cause) {
    if (cause instanceof SqlRejected)
      throw new QueryFailed({ kind: "rejected", message: cause.message, at: cause.at });
    throw cause;
  }
  // The second guard, independent of how the SQL parses: no other namespace's name at all.
  if (checked.kind !== "show") {
    const names = await otherNamespaces(token, limits, request, signal);
    const found = mentionedNamespace(text, names);
    if (found)
      throw new QueryFailed({
        kind: "rejected",
        message: `"${found.name}" is another namespace in this bucket; only "${NAMESPACE}" can be read. (A column or string spelled the same is refused too: rename it with AS.)`,
        at: found.at,
      });
  }
  return send(token, checked, limits, request, signal);
}

const NAME_CHAR = "[\\p{Alphabetic}\\p{M}\\p{N}_$@#]";
const NAMESPACE_TTL = 5 * 60 * 1000;
let namespaces: { names: string[]; at: number } | null = null;

/** Forgets the cached namespace list (tests; a new namespace is otherwise seen within 5 min). */
export function forgetNamespaces() {
  namespaces = null;
}

/**
 * The bucket's namespaces other than `default`, from SHOW DATABASES, cached per isolate for
 * five minutes. Fails closed: when the list cannot be read, no query runs.
 */
async function otherNamespaces(
  token: string,
  limits: Limits,
  request: typeof fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  if (namespaces && Date.now() - namespaces.at < NAMESPACE_TTL) return namespaces.names;
  let values: string[];
  try {
    const listed = await send(
      token,
      checkQuery("SHOW DATABASES"),
      { ...limits, maxRows: 1000, maxBytes: 1024 * 1024 },
      request,
      signal,
    );
    const column = listed.columns.findIndex((c) => /namespace|database|schema|name/i.test(c.name));
    values = listed.rows
      .flatMap((row) => (column >= 0 ? [row[column]] : row))
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    values = [];
  }
  if (!values.includes(NAMESPACE))
    throw new QueryFailed({
      kind: "unavailable",
      message: "The bucket's namespaces could not be listed, so no query runs (the namespace guard fails closed). Try again shortly.",
    });
  const names = [...new Set(values.filter((v) => v !== NAMESPACE))];
  namespaces = { names, at: Date.now() };
  return names;
}

/** Where `text` names one of `names` as a whole word (any case), quoted or not. */
export function mentionedNamespace(text: string, names: string[]): { name: string; at: number } | null {
  let first: { name: string; at: number } | null = null;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(?<!${NAME_CHAR})${escaped}(?!${NAME_CHAR})`, "iu").exec(text);
    if (m && (!first || m.index < first.at)) first = { name, at: m.index };
  }
  return first;
}

async function send(
  token: string,
  checked: CheckedQuery,
  limits: Limits,
  request: typeof fetch,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const started = Date.now();
  let response: Response;
  try {
    response = await request(SQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: checked.sql }),
      cache: "no-store",
      redirect: "manual",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch {
    if (timeout.aborted)
      throw new QueryFailed({
        kind: "timeout",
        message: `No answer within ${limits.timeoutMs / 1000} s, so the workbench stopped waiting. R2 SQL may still finish (and bill) the query.`,
      });
    throw new QueryFailed({ kind: "unavailable", message: "R2 SQL could not be reached." });
  }
  let text: string;
  try {
    text = await readBounded(response, limits.maxBytes);
  } catch (cause) {
    if (cause instanceof QueryFailed) throw cause;
    if (timeout.aborted)
      throw new QueryFailed({
        kind: "timeout",
        message: `The answer did not finish within ${limits.timeoutMs / 1000} s, so the workbench stopped waiting.`,
      });
    throw new QueryFailed({ kind: "unavailable", message: "R2 SQL's answer was cut off." });
  }
  const elapsedMs = Date.now() - started;
  let body: Record<string, any> | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body?.success === true && response.ok)
    return projectResult(body.result, checked, limits.maxRows, elapsedMs);
  const errors: unknown[] = Array.isArray(body?.errors) ? body!.errors : [];
  const message = errors
    .map((e) => (e && typeof e === "object" && typeof (e as any).message === "string" ? (e as any).message : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  if (response.status === 401 || response.status === 403)
    throw new QueryFailed({
      kind: "unavailable",
      message: "R2 SQL refused the workbench's credential. It may have been removed or changed.",
    });
  if (message && response.status < 500)
    throw new QueryFailed({ kind: "sql", message, ...errorPlace(message) });
  if (response.status === 429)
    throw new QueryFailed({ kind: "unavailable", message: "R2 SQL is rate limiting queries; wait a moment and run again." });
  throw new QueryFailed({
    kind: "unavailable",
    message: message ? `R2 SQL failed (${response.status}): ${message}` : `R2 SQL failed (${response.status}).`,
  });
}

export interface SchemaColumn {
  name: string;
  type: string;
  required: boolean | null;
  doc: string | null;
}
export interface SchemaTable {
  namespace: string;
  name: string;
  columns: SchemaColumn[];
}
export interface Schema {
  tables: SchemaTable[];
  /** Tables listed but not described (a failure is per table). */
  failed: string[];
  loadedAt: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** SHOW TABLES IN default, then DESCRIBE each table: metadata only, no rows are scanned. */
export async function readSchema(
  token: string,
  limits: Limits = DEFAULT_LIMITS,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Schema> {
  const metaLimits = { ...limits, maxRows: 1000, maxBytes: 1024 * 1024 };
  const listed = await send(token, checkQuery(`SHOW TABLES IN ${NAMESPACE}`), metaLimits, request, signal);
  const nameColumn =
    listed.columns.findIndex((c) => /^(table_?name|name|table)$/i.test(c.name)) >= 0
      ? listed.columns.findIndex((c) => /^(table_?name|name|table)$/i.test(c.name))
      : listed.columns.findIndex((c) => /table/i.test(c.name));
  const names = [
    ...new Set(
      listed.rows
        .map((row) => row[Math.max(0, nameColumn)])
        .filter((v): v is string => typeof v === "string" && NAME.test(v)),
    ),
  ]
    .sort()
    .slice(0, 50);
  const failed: string[] = [];
  const tables: SchemaTable[] = [];
  // One at a time, so a schema read is one query in flight, like any other (the route's bound).
  for (const name of names) {
    try {
      const d = await send(token, checkQuery(`DESCRIBE ${NAMESPACE}.${name}`), metaLimits, request, signal);
      const at = (pattern: RegExp) => d.columns.findIndex((c) => pattern.test(c.name));
      const col = at(/^(column_?name|name|field)$/i);
      const type = at(/^(type|data_?type)$/i);
      const required = at(/^(required|not_?null)$/i);
      const nullable = at(/^(nullable|is_nullable)$/i);
      const doc = at(/^(doc|comment|description)$/i);
      if (col < 0) throw new Error("No column names.");
      tables.push({
        namespace: NAMESPACE,
        name,
        columns: d.rows
          .filter((row) => typeof row[col] === "string")
          .map((row) => ({
            name: row[col] as string,
            type: type >= 0 && row[type] != null ? String(row[type]) : "",
            required:
              required >= 0 && typeof row[required] === "boolean"
                ? (row[required] as boolean)
                : nullable >= 0 && typeof row[nullable] === "boolean"
                  ? !(row[nullable] as boolean)
                  : null,
            doc: doc >= 0 && typeof row[doc] === "string" && row[doc] ? (row[doc] as string) : null,
          })),
      } satisfies SchemaTable);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      failed.push(name);
    }
  }
  return { tables, failed, loadedAt: new Date().toISOString() };
}
