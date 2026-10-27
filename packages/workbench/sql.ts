/**
 * The admin SQL workbench's reading of a query (docs/admin-sql.md): tokens, statements, and
 * the read-only check the server applies before anything reaches R2 SQL. Pure, so the browser
 * splits statements exactly as the server checks them.
 *
 * The check is a second line behind the engine: R2 SQL only runs reads, and the token it is
 * called with can only read. It does not parse SQL fully. It rejects what it cannot read with
 * certainty (unterminated strings or comments, nested block comments, strings whose ending
 * depends on whether backslash escapes), then requires one statement of an allowed kind, no
 * write or session keyword anywhere outside strings and quoted identifiers, and tables only
 * from the `default` namespace of the events bucket.
 */

export type TokenKind =
  | "word"
  | "quoted"
  | "string"
  | "number"
  | "comment"
  | "space"
  | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
  from: number;
  to: number;
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

const IDENT_PART = /[\p{L}\p{N}_$@#]/u;
const OPERATORS = [
  "->>", "#>>", "!~*", "||/", "<=>", "<<", ">>", "<=", ">=", "<>", "!=", "==", "||", "::", "=>",
  "->", "#>", "@>", "<@", "&&", "!~", "~*", "~~", "^@", "|/", "@@",
];

/** Length of a literal's prefix (E, X, N, B or U&) when one starts a string at `i`, else 0. */
function stringPrefix(text: string, i: number): number {
  if (IDENT_PART.test(text[i - 1] ?? "")) return 0;
  if (/[EeXxNnBb]/.test(text[i]) && text[i + 1] === "'") return 1;
  if (/[Uu]/.test(text[i]) && text[i + 1] === "&" && text[i + 2] === "'") return 2;
  return 0;
}

/**
 * Splits text into tokens. `backslash` reads `\` inside '…' as an escape, as some engines do;
 * the check reads both ways and refuses text where the two disagree.
 */
export function tokenize(text: string, backslash = false): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, from: number) =>
    tokens.push({ kind, text: text.slice(from, i), from, to: i });
  while (i < text.length) {
    const from = i;
    const c = text[i];
    if (/\s/.test(c)) {
      while (i < text.length && /\s/.test(text[i])) i++;
      push("space", from);
    } else if (c === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      push("comment", from);
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      for (;;) {
        if (i >= text.length)
          throw new SqlRejected("This block comment is never closed.", from);
        if (text[i] === "/" && text[i + 1] === "*")
          throw new SqlRejected(
            "Nested block comments are not accepted: engines disagree about where they end.",
            i,
          );
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      push("comment", from);
    } else if (c === "'" || stringPrefix(text, i) > 0) {
      // A prefix (E'…', X'…', N'…', B'…', U&'…') belongs to its string; E strings always escape.
      const escapes = backslash || c === "E" || c === "e";
      i += c === "'" ? 1 : stringPrefix(text, i) + 1;
      for (;;) {
        if (i >= text.length)
          throw new SqlRejected("This string is never closed.", from);
        if (escapes && text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      push("string", from);
    } else if (c === '"' || c === "`") {
      i++;
      for (;;) {
        if (i >= text.length)
          throw new SqlRejected("This quoted name is never closed.", from);
        if (text[i] === c) {
          if (text[i + 1] === c) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      push("quoted", from);
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      while (i < text.length && /[0-9a-zA-Z_.]/.test(text[i])) {
        // 1e-5: the sign belongs to the number.
        if (/[eE]/.test(text[i]) && /[+-]/.test(text[i + 1] ?? "")) i++;
        i++;
      }
      push("number", from);
    } else if (/[\p{L}_]/u.test(c) || (/[#@]/.test(c) && IDENT_PART.test(text[i + 1] ?? ""))) {
      // R2 SQL's dialect allows @, # and $ inside names: read the whole name as one word.
      while (i < text.length && IDENT_PART.test(text[i])) i++;
      push("word", from);
    } else {
      // Operators are read longest first, so the formatter keeps them whole.
      i += OPERATORS.find((op) => text.startsWith(op, i))?.length ?? 1;
      push("punct", from);
    }
  }
  return tokens;
}

export interface Statement {
  /** Offsets of the statement in the text, without surrounding space or the semicolon. */
  from: number;
  to: number;
  text: string;
}

/** Statements separated by semicolons outside strings, comments and quoted names. */
export function statements(text: string, tokens = tokenize(text)): Statement[] {
  const result: Statement[] = [];
  let start: number | null = null;
  let end = 0;
  const close = () => {
    if (start !== null)
      result.push({ from: start, to: end, text: text.slice(start, end) });
    start = null;
  };
  for (const t of tokens) {
    if (t.kind === "punct" && t.text === ";") close();
    else if (t.kind !== "space" && t.kind !== "comment") {
      if (start === null) start = t.from;
      end = t.to;
    }
  }
  close();
  return result;
}

/**
 * The statement the cursor is in or just after. Text that does not tokenize (an unclosed
 * string while typing) falls back to the blank-line-separated block around the cursor.
 */
export function statementAt(text: string, position: number): Statement | null {
  let list: Statement[];
  try {
    list = statements(text);
  } catch {
    const before = text.lastIndexOf("\n\n", Math.max(0, position - 1));
    const after = text.indexOf("\n\n", position);
    const from = before < 0 ? 0 : before + 2;
    const to = after < 0 ? text.length : after;
    const block = text.slice(from, to);
    const lead = block.length - block.trimStart().length;
    const trimmed = block.trim();
    return trimmed ? { from: from + lead, to: from + lead + trimmed.length, text: trimmed } : null;
  }
  if (!list.length) return null;
  // Inside a statement, or between two: the one that ended last before the cursor.
  let best = list[0];
  for (const s of list) {
    if (s.from <= position) best = s;
    if (s.from <= position && position <= s.to) return s;
  }
  return best;
}

/** Words that change data, schema or session, never part of a read. */
const DENIED = new Set(
  (
    "INSERT UPDATE DELETE MERGE UPSERT CREATE DROP ALTER TRUNCATE RENAME COPY GRANT REVOKE " +
    "CALL EXEC EXECUTE PREPARE DEALLOCATE ATTACH DETACH INSTALL LOAD PRAGMA VACUUM OPTIMIZE " +
    "SET RESET BEGIN START COMMIT ROLLBACK SAVEPOINT RELEASE LOCK UNLOCK USE INTO REFRESH " +
    "CACHE UNCACHE MSCK DECLARE KILL COMMENT REPAIR TABLE"
  ).split(" "),
);
const STARTS = new Set(["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "VALUES"]);
/** Where a table name follows. */
const RELATION = new Set(["FROM", "JOIN"]);
/** Clauses that end a FROM list, so a later comma is not another table. */
const CLAUSE = new Set([
  "SELECT", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "OFFSET", "QUALIFY", "UNION",
  "INTERSECT", "EXCEPT", "WINDOW", "FETCH",
]);
/** What a subquery's parentheses start with (FROM for FROM-first queries). */
const QUERY_START = new Set(["SELECT", "WITH", "VALUES", "FROM"]);
export const NAMESPACE = "default";

export type StatementKind = "select" | "show" | "describe" | "explain";

export interface CheckedQuery {
  /** The statement as it is sent: the text without a trailing semicolon. */
  sql: string;
  kind: StatementKind;
  /** Whether the outermost query sets its own LIMIT (R2 SQL otherwise returns at most 500). */
  limited: boolean;
}

function meaningful(tokens: Token[]) {
  return tokens.filter((t) => t.kind !== "space" && t.kind !== "comment");
}

/** A name as the engine resolves it: unquoted names are lower-cased, quoted ones kept exactly. */
function unquote(t: Token): string {
  return t.kind === "quoted"
    ? t.text.slice(1, -1).replaceAll(t.text[0] + t.text[0], t.text[0])
    : t.text.toLowerCase();
}

/** A dotted name starting at `i`: its parts and the index after it. */
function dotted(tokens: Token[], i: number): { parts: string[]; next: number; broken: boolean } {
  const parts: string[] = [];
  let j = i;
  for (;;) {
    const t = tokens[j];
    if (!t || (t.kind !== "word" && t.kind !== "quoted")) return { parts, next: j, broken: true };
    parts.push(unquote(t));
    j++;
    if (tokens[j]?.text === "." && tokens[j].kind === "punct") j++;
    else return { parts, next: j, broken: false };
  }
}

function checkRelation(parts: string[], at: number) {
  if (parts.length > 2)
    throw new SqlRejected(
      `Only tables in this bucket's "${NAMESPACE}" namespace can be read (namespace.table at most).`,
      at,
    );
  if (parts.length === 2 && parts[0] !== NAMESPACE)
    throw new SqlRejected(
      `Only tables in the "${NAMESPACE}" namespace can be read, not "${parts[0]}".`,
      at,
    );
}

/**
 * The read-only check. Returns the one statement to send, or throws SqlRejected with where.
 * `maxLength` bounds the text in UTF-16 code units.
 */
export function checkQuery(text: string, maxLength = 20000): CheckedQuery {
  if (text.length > maxLength)
    throw new SqlRejected(`Queries are limited to ${maxLength} characters.`);
  const plain = tokenize(text, false);
  let escaped: Token[] | null = null;
  try {
    escaped = tokenize(text, true);
  } catch {
    escaped = null;
  }
  // Both readings must agree token for token, or the text is ambiguous.
  if (
    !escaped ||
    escaped.length !== plain.length ||
    escaped.some((t, i) => t.from !== plain[i].from || t.to !== plain[i].to)
  ) {
    const s = plain.find((t) => t.kind === "string" && t.text.includes("\\"));
    throw new SqlRejected(
      "This string reads differently depending on whether backslash escapes; write a quote inside a string as '' instead.",
      s?.from ?? null,
    );
  }
  const list = statements(text, plain);
  if (!list.length) throw new SqlRejected("There is no statement to run.");
  if (list.length > 1)
    throw new SqlRejected(
      "Run one statement at a time: select it, or put the cursor in it.",
      list[1].from,
    );
  const sql = list[0].text;
  const offset = list[0].from;
  const tokens = meaningful(tokenize(sql));
  const at = (t: Token) => offset + t.from;

  const first = tokens[0];
  let i = 0;
  while (tokens[i]?.text === "(") i++;
  const lead = tokens[i];
  const word = lead?.kind === "word" ? lead.text.toUpperCase() : "";
  if (!STARTS.has(word))
    throw new SqlRejected(
      "Only reads run here: SELECT, WITH, VALUES, SHOW, DESCRIBE or EXPLAIN.",
      at(lead ?? first),
    );
  if (i > 0 && word !== "SELECT" && word !== "WITH" && word !== "VALUES")
    throw new SqlRejected("Only a query can be parenthesised.", at(first));

  for (const t of tokens)
    if (t.kind === "word" && DENIED.has(t.text.toUpperCase()))
      throw new SqlRejected(
        `"${t.text}" is not allowed: this workbench only reads. A column with this name can be written as a quoted name ("${t.text.toLowerCase()}").`,
        at(t),
      );
    else if (t.kind === "punct" && (t.text === "$" || t.text === "?"))
      throw new SqlRejected("Parameters and dollar quoting are not supported here.", at(t));

  let kind: StatementKind = "select";
  if (word === "SHOW") {
    kind = "show";
    const what = tokens.slice(1).map((t) => (t.kind === "word" ? t.text.toUpperCase() : null));
    const ok =
      (what.length === 1 && (what[0] === "DATABASES" || what[0] === "NAMESPACES")) ||
      (what.length === 3 &&
        what[0] === "TABLES" &&
        what[1] === "IN" &&
        (tokens[3].kind === "word" || tokens[3].kind === "quoted") &&
        unquote(tokens[3]) === NAMESPACE);
    if (!ok)
      throw new SqlRejected(
        `Use SHOW DATABASES, SHOW NAMESPACES or SHOW TABLES IN ${NAMESPACE}.`,
        at(first),
      );
  } else if (word === "DESCRIBE" || word === "DESC") {
    kind = "describe";
    const name = dotted(tokens, 1);
    if (name.broken || name.next !== tokens.length)
      throw new SqlRejected(`Use DESCRIBE ${NAMESPACE}.<table>.`, at(first));
    checkRelation(name.parts, at(tokens[1]));
  } else if (word === "EXPLAIN") {
    // Only a query can be explained; options first (ANALYZE, VERBOSE, FORMAT x).
    kind = "explain";
    let j = 1;
    for (;;) {
      const option = tokens[j]?.kind === "word" ? tokens[j].text.toUpperCase() : "";
      if (option === "ANALYZE" || option === "VERBOSE") j++;
      else if (option === "FORMAT" && tokens[j + 1]?.kind === "word") j += 2;
      else break;
    }
    const body = tokens[j];
    if (!body || !((body.kind === "word" && QUERY_START.has(body.text.toUpperCase()) && body.text.toUpperCase() !== "FROM") || body.text === "("))
      throw new SqlRejected("EXPLAIN works on a query here (SELECT, WITH or VALUES).", at(body ?? first));
  }

  // Every table reference is checked, failing closed: after FROM or JOIN, after commas in a
  // FROM list, and first in a parenthesised join. Only a name, a subquery or a parenthesised
  // join may stand there. FROM inside a function call's parentheses (EXTRACT(YEAR FROM t),
  // TRIM(x FROM y)) is an expression, not a table.
  const fromList: boolean[] = [false];
  const query: boolean[] = [true];
  let depth = 0;
  let expect = false;
  // A word right after a dot is part of a name (e.distinct, b.group), never a keyword.
  const keyword = (j: number) =>
    tokens[j]?.kind === "word" && !(tokens[j - 1]?.kind === "punct" && tokens[j - 1].text === ".")
      ? tokens[j].text.toUpperCase()
      : "";
  // A parenthesis holds a query only when one starts right inside it; ((x) FROM 1) is an
  // expression, and ((SELECT …)) is read when its inner parenthesis is.
  const opens = (j: number) => QUERY_START.has(keyword(j + 1));
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    const upper = keyword(j);
    if (expect) {
      expect = false;
      if (t.kind === "punct" && t.text === "(") {
        // A subquery, or a parenthesised join whose first item is a table again.
        const subquery = opens(j);
        depth++;
        query[depth] = true;
        fromList[depth] = !subquery;
        expect = !subquery;
        continue;
      }
      if (t.kind !== "word" && t.kind !== "quoted")
        throw new SqlRejected("Only a table name, a subquery or a parenthesised join can stand here.", at(t));
      const name = dotted(tokens, j);
      if (name.broken)
        throw new SqlRejected("Only a table name, a subquery or a parenthesised join can stand here.", at(t));
      if (tokens[name.next]?.text === "(" && tokens[name.next].kind === "punct")
        throw new SqlRejected("Table functions are not available here.", at(t));
      checkRelation(name.parts, at(t));
      j = name.next - 1;
      continue;
    }
    if (t.kind === "punct" && (t.text === "(" || t.text === "[" || t.text === "{")) {
      depth++;
      fromList[depth] = false;
      query[depth] = t.text === "(" && opens(j);
      continue;
    }
    if (t.kind === "punct" && (t.text === ")" || t.text === "]" || t.text === "}")) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    // JOIN only ever names a table; FROM and commas do in a query's own parentheses.
    if (upper === "JOIN") {
      expect = true;
      continue;
    }
    if (!query[depth]) continue;
    if (CLAUSE.has(upper)) fromList[depth] = false;
    // a IS [NOT] DISTINCT FROM b compares; it names no table.
    const distinct =
      upper === "FROM" &&
      keyword(j - 1) === "DISTINCT" &&
      (keyword(j - 2) === "IS" || (keyword(j - 2) === "NOT" && keyword(j - 3) === "IS"));
    if (upper === "FROM" && !distinct) {
      fromList[depth] = true;
      expect = true;
    } else if (t.kind === "punct" && t.text === "," && fromList[depth]) expect = true;
  }
  if (expect) throw new SqlRejected("A table name is missing.", offset + sql.length);

  // LIMIT at the outermost level (not inside a subquery or CTE).
  depth = 0;
  let limited = false;
  for (const t of tokens) {
    if (t.kind === "punct" && t.text === "(") depth++;
    else if (t.kind === "punct" && t.text === ")") depth--;
    else if (depth === 0 && t.kind === "word" && t.text.toUpperCase() === "LIMIT") limited = true;
  }
  return { sql, kind, limited: kind !== "select" || limited };
}
