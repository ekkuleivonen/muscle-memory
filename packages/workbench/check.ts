/**
 * The workbench's read-only check (docs/admin-sql.md), on the syntax tree of R2 SQL's own
 * parser: datafusion-sqlparser-rs with DataFusion's default (generic) dialect, as WebAssembly.
 * Reading the tree, not the text, means strings, comments, aliases and keywords used as names
 * are whatever the engine takes them to be, and every table reference is a node to check.
 *
 * Allowed: one statement, a query (SELECT, WITH, VALUES, set operations), EXPLAIN of a
 * query, SHOW DATABASES, SHOW TABLES IN default, DESCRIBE default.<table>. Every table
 * reference must be a plain name, bare (a CTE or a table in `default`) or `default.<table>`;
 * subqueries and parenthesised joins are followed. Anything else is refused: the check fails
 * closed on syntax it does not know.
 */

import { statements as split } from "./sql";

/** Parses SQL into sqlparser-rs's JSON syntax tree; throws the parser's error. */
export type SqlParse = (sql: string) => unknown[];

export const NAMESPACE = "default";

export type StatementKind = "select" | "show" | "describe" | "explain";

export interface CheckedQuery {
  /** The statement as it is sent: the text without trailing space or `;`. */
  sql: string;
  kind: StatementKind;
  /** Whether the outermost query sets its own LIMIT (R2 SQL otherwise returns at most 500). */
  limited: boolean;
}

export class SqlRejected extends Error {
  constructor(
    message: string,
    /** Offset into the checked text, when the problem has a place. */
    readonly at: number | null = null,
  ) {
    super(message);
  }
}

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

/** The single key of an enum node ({"Select": {…}}), or null. */
function variant(v: unknown): [string, unknown] | null {
  if (!isNode(v)) return null;
  const keys = Object.keys(v);
  return keys.length === 1 ? [keys[0], v[keys[0]]] : null;
}

/** Offsets of each line start, to turn the parser's (line, column) spans into offsets. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

/** The first span found in a node: where to point at it. Columns count characters. */
function spanOf(node: unknown, text: string, starts: number[]): number | null {
  const stack: unknown[] = [node];
  while (stack.length) {
    const v = stack.shift();
    if (Array.isArray(v)) stack.push(...v);
    else if (isNode(v)) {
      const span = v.span;
      if (isNode(span) && isNode(span.start)) {
        const { line, column } = span.start as { line: number; column: number };
        if (line >= 1 && column >= 1 && line <= starts.length) {
          // Columns are code points; walk them to a UTF-16 offset.
          let at = starts[line - 1];
          for (let c = 1; c < column && at < text.length; c++)
            at += String.fromCodePoint(text.codePointAt(at) ?? 0).length;
          return at;
        }
      }
      stack.push(...Object.values(v));
    }
  }
  return null;
}

/** Where the second statement starts, by the editor's own splitting. */
function secondStatement(text: string): number | null {
  try {
    return split(text)[1]?.from ?? null;
  } catch {
    return null;
  }
}

interface Ident {
  value: string;
  quoted: boolean;
}

/** An object name ([{"Identifier": {value, quote_style}}, …]) as identifiers, or null. */
function objectName(v: unknown): Ident[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const parts: Ident[] = [];
  for (const part of v) {
    const p = variant(part);
    const ident = p && p[0] === "Identifier" && isNode(p[1]) ? p[1] : isNode(part) && "value" in part ? part : null;
    if (!ident || typeof ident.value !== "string") return null;
    parts.push({ value: ident.value, quoted: ident.quote_style != null });
  }
  return parts;
}

/** Whether a name resolves to the `default` namespace: unquoted names fold to lower case. */
const isNamespace = (p: Ident) => (p.quoted ? p.value : p.value.toLowerCase()) === NAMESPACE;

function checkTableName(parts: Ident[] | null, where: () => number | null) {
  if (!parts) throw new SqlRejected("This table reference is not a plain name.", where());
  if (parts.length > 2)
    throw new SqlRejected(
      `Only tables in this bucket's "${NAMESPACE}" namespace can be read (namespace.table at most).`,
      where(),
    );
  if (parts.length === 2 && !isNamespace(parts[0]))
    throw new SqlRejected(
      `Only tables in the "${NAMESPACE}" namespace can be read, not "${parts[0].value}".`,
      where(),
    );
}

/** Query bodies that read; any other (INSERT, UPDATE, DELETE, MERGE, TABLE …) is refused. */
const READ_BODIES = new Set(["Select", "Query", "SetOperation", "Values"]);
/** What may stand where a table goes. */
const RELATIONS = new Set(["Table", "Derived", "NestedJoin"]);

/** Walks the whole tree: every table position, query body and SELECT INTO is checked. */
function walk(node: unknown, text: string, starts: number[]) {
  const where = (n: unknown) => () => spanOf(n, text, starts);
  const stack: unknown[] = [node];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      stack.push(...v);
      continue;
    }
    if (!isNode(v)) continue;
    for (const [key, child] of Object.entries(v)) {
      if (key === "relation" && child != null) {
        const r = variant(child);
        if (!r || !RELATIONS.has(r[0]))
          throw new SqlRejected(
            `${r ? r[0] : "This"} is not available where a table goes: use a table name, a subquery or a parenthesised join.`,
            where(child)(),
          );
        if (r[0] === "Table") {
          const table = r[1] as Node;
          if (table.args != null)
            throw new SqlRejected("Table functions are not available here.", where(child)());
          checkTableName(objectName(table.name), where(child));
        }
      } else if ((key === "body" || key === "left" || key === "right") && child != null) {
        const b = variant(child);
        // A query's body and a set operation's sides are SetExprs; other nodes with these keys
        // (a binary operator's left and right) are expressions, walked like any node.
        const setExpr = key === "body" ? "locks" in v || "pipe_operators" in v : "set_quantifier" in v;
        if (b && setExpr && !READ_BODIES.has(b[0]))
          throw new SqlRejected(`Only reads run here, not ${b[0].toUpperCase()}.`, where(child)());
      } else if (key === "into" && isNode(child)) {
        throw new SqlRejected("SELECT INTO writes a table; only reads run here.", where(child)());
      }
      stack.push(child);
    }
  }
}

/**
 * The read-only check. Returns the one statement to send, or throws SqlRejected with where.
 * `maxLength` bounds the text in UTF-16 code units.
 */
export function checkQuery(text: string, parse: SqlParse, maxLength = 20000): CheckedQuery {
  if (text.length > maxLength)
    throw new SqlRejected(`Queries are limited to ${maxLength} characters.`);
  const starts = lineStarts(text);
  let statements: unknown[];
  try {
    statements = parse(text);
  } catch (cause) {
    const message = String(cause instanceof Error ? cause.message : cause).replace(/^ParserError:\s*/, "");
    const place = /Line: (\d+), Column: (\d+)/.exec(message);
    let at: number | null = null;
    if (place) {
      const line = Number(place[1]);
      const column = Number(place[2]);
      if (line >= 1 && line <= starts.length) at = Math.min(text.length, starts[line - 1] + column - 1);
    }
    throw new SqlRejected(message || "R2 SQL's parser could not read this.", at);
  }
  if (!statements.length) throw new SqlRejected("There is no statement to run.");
  if (statements.length > 1)
    throw new SqlRejected(
      "Run one statement at a time: select it, or put the cursor in it.",
      secondStatement(text) ?? spanOf(statements[1], text, starts),
    );
  const statement = variant(statements[0]);
  if (!statement) throw new SqlRejected("This statement could not be read.");
  const [type, body] = statement;
  const where = () => spanOf(body, text, starts);
  let kind: StatementKind;
  let query: unknown = null;
  switch (type) {
    case "Query":
      kind = "select";
      query = body;
      break;
    case "Explain": {
      kind = "explain";
      const inner = variant((body as Node).statement);
      if (!inner || inner[0] !== "Query")
        throw new SqlRejected("EXPLAIN works on a query here (SELECT, WITH or VALUES).", where());
      break;
    }
    case "ShowDatabases":
      kind = "show";
      break;
    case "ShowTables": {
      kind = "show";
      const options = (body as Node).show_options as Node | undefined;
      const showIn = options?.show_in as Node | undefined;
      const parent = objectName(showIn?.parent_name);
      const ok =
        parent?.length === 1 &&
        isNamespace(parent[0]) &&
        Object.entries(options ?? {}).every(([k, v]) => k === "show_in" || v == null);
      if (!ok) throw new SqlRejected(`Use SHOW TABLES IN ${NAMESPACE}.`, where());
      break;
    }
    case "ExplainTable": {
      kind = "describe";
      const name = objectName((body as Node).table_name);
      if (!name || name.length !== 2) throw new SqlRejected(`Use DESCRIBE ${NAMESPACE}.<table>.`, where());
      checkTableName(name, where);
      break;
    }
    default:
      throw new SqlRejected(
        "Only reads run here: SELECT, WITH, VALUES, EXPLAIN of a query, SHOW or DESCRIBE.",
        where() ?? 0,
      );
  }
  walk(statements[0], text, starts);

  // The text to send: without trailing space or semicolons. Leading text stays, so the
  // engine's line and column numbers match what the editor sent.
  let sql = text.trimEnd();
  while (sql.endsWith(";")) sql = sql.slice(0, -1).trimEnd();
  const outer = query as Node | null;
  const limited =
    kind !== "select" ||
    !!(outer && (outer.limit_clause != null || outer.limit != null || outer.fetch != null));
  return { sql, kind, limited };
}
