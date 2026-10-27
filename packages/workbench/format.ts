/**
 * Formats SQL by re-spacing its tokens. Strings, quoted names, numbers and comments are kept
 * exactly; only whitespace changes, and reserved words that can never be a bare name are
 * upper-cased. Text that does not tokenize (an unclosed string) is returned unchanged.
 */
import { tokenize, type Token } from "./sql";

/** Upper-cased: reserved in SQL, so never an unquoted column or table name. */
const RESERVED = new Set(
  (
    "SELECT FROM WHERE AND OR NOT AS ON USING JOIN INNER OUTER FULL CROSS NATURAL GROUP BY " +
    "ORDER HAVING LIMIT OFFSET UNION ALL INTERSECT EXCEPT DISTINCT CASE WHEN THEN ELSE END IN " +
    "IS NULL LIKE ILIKE SIMILAR BETWEEN WITH ASC DESC NULLS OVER PARTITION QUALIFY EXISTS TRUE " +
    "FALSE CAST TRY_CAST INTERVAL VALUES SHOW DESCRIBE EXPLAIN"
  ).split(" "),
);
/** Clauses that start a line at their query's indentation. */
const CLAUSES = new Set([
  "SELECT", "FROM", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "OFFSET", "QUALIFY",
  "UNION", "INTERSECT", "EXCEPT", "WITH", "VALUES", "WINDOW",
]);
const JOIN_WORDS = new Set(["JOIN", "LEFT", "RIGHT", "INNER", "FULL", "CROSS", "NATURAL", "OUTER", "SEMI", "ANTI"]);
/** Words written like functions, glued to their parenthesis. */
const CALL_WORDS = new Set(["CAST", "TRY_CAST", "EXTRACT", "LEFT", "RIGHT", "ROLLUP", "CUBE", "GROUPING", "COUNT"]);
const INDENT = "  ";

interface Level {
  /** A query's parentheses (subquery, CTE body), as opposed to a call's or an expression's. */
  query: boolean;
  indent: number;
  clause: string;
  /** Open BETWEENs, whose AND stays on the line. */
  between: number;
  /** Indentation of each open CASE. */
  cases: number[];
  /** The parentheses of DISTINCT ON (…), after which the select list starts. */
  distinctOn?: boolean;
}

export function formatSql(text: string): string {
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    return text;
  }
  const parts = tokens.filter((t) => t.kind !== "space");
  if (!parts.length) return text;
  let out = "";
  const level0 = (): Level => ({ query: true, indent: 0, clause: "", between: 0, cases: [] });
  const stack: Level[] = [level0()];
  const newline = (indent: number) => {
    out = out.replace(/[ \t]+$/, "");
    if (out && !out.endsWith("\n")) out += "\n";
    out += INDENT.repeat(Math.max(0, indent));
  };
  const lineIndent = () => {
    const line = out.slice(out.lastIndexOf("\n") + 1);
    return Math.floor((line.length - line.trimStart().length) / INDENT.length);
  };
  const upperOf = (t: Token | undefined) => (t?.kind === "word" ? t.text.toUpperCase() : "");
  let prev: Token | null = null;

  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    const next = parts[i + 1];
    const level = stack[stack.length - 1];
    const upper = upperOf(t);
    const prevUpper = upperOf(prev ?? undefined);
    const afterDot = prev?.kind === "punct" && prev.text === ".";
    const word = upper && !afterDot ? upper : "";
    let placed = false;
    let join = false;

    if (t.kind === "punct" && t.text === ";") {
      out = out.replace(/\s+$/, "") + ";";
      stack.length = 0;
      stack.push(level0());
      if (next) out += "\n\n";
      prev = t;
      continue;
    }
    if (t.kind === "punct" && t.text === ")") {
      const closing = stack.length > 1 ? stack.pop()! : level;
      if (closing.query) newline(closing.indent - 1);
      out = out.replace(/[ \t]+$/, "") + ")";
      if (closing.distinctOn) newline(stack[stack.length - 1].indent + 1);
      prev = t;
      continue;
    }

    if (level.query && !level.cases.length && word) {
      join =
        !JOIN_WORDS.has(prevUpper) &&
        (word === "JOIN" ||
          (JOIN_WORDS.has(word) && ["JOIN", "OUTER", "SEMI", "ANTI"].includes(upperOf(next))));
      const clause =
        CLAUSES.has(word) &&
        !(word === "FROM" && prevUpper === "DISTINCT") &&
        !(word === "UNION" && prev?.kind === "punct");
      if (clause || join) {
        newline(level.indent);
        placed = true;
        level.clause = clause ? word : "JOIN";
      } else if (
        (word === "AND" || word === "OR") &&
        level.between === 0 &&
        ["WHERE", "HAVING", "QUALIFY", "JOIN"].includes(level.clause)
      ) {
        newline(level.indent + 1);
        placed = true;
      } else if (word === "ON" && level.clause === "JOIN") {
        newline(level.indent + 1);
        placed = true;
      }
    }
    if (level.cases.length && (word === "WHEN" || word === "ELSE")) {
      newline(level.cases[level.cases.length - 1] + 1);
      placed = true;
    }
    if (level.cases.length && word === "END") {
      newline(level.cases.pop()!);
      placed = true;
    }
    if (word === "AND" && level.between > 0) level.between--;
    if (word === "BETWEEN") level.between++;

    if (!placed && out && !/\s$/.test(out)) {
      const glued =
        (t.kind === "punct" && [",", ".", "::", "[", "]"].includes(t.text)) ||
        (prev?.kind === "punct" && ["(", ".", "::", "["].includes(prev.text)) ||
        (t.kind === "punct" &&
          t.text === "(" &&
          (prev?.kind === "quoted" ||
            (prev?.kind === "word" && (!RESERVED.has(prevUpper) || CALL_WORDS.has(prevUpper)))));
      if (!glued) out += " ";
    }
    out += t.kind === "comment" ? t.text.replace(/\s+$/, "") : RESERVED.has(word) || join ? word : t.text;

    if (t.kind === "comment" && t.text.startsWith("--")) {
      newline(lineIndent());
    } else if (t.kind === "punct" && t.text === "(") {
      const query = ["SELECT", "WITH", "VALUES"].includes(upperOf(next));
      stack.push({
        query,
        indent: query ? level.indent + 1 : level.indent,
        clause: "",
        between: 0,
        cases: [],
        distinctOn: prevUpper === "ON" && upperOf(parts[i - 2]) === "DISTINCT",
      });
      if (query) newline(level.indent + 1);
    } else if (
      t.kind === "punct" &&
      t.text === "," &&
      level.query &&
      !level.cases.length &&
      ["SELECT", "WITH"].includes(level.clause)
    ) {
      newline(level.indent + (level.clause === "WITH" ? 0 : 1));
    } else if (level.query && !level.cases.length && word === "SELECT") {
      if (!["DISTINCT", "ALL"].includes(upperOf(next))) newline(level.indent + 1);
    } else if (level.query && word === "DISTINCT" && prevUpper === "SELECT") {
      if (upperOf(next) !== "ON") newline(level.indent + 1);
    } else if (word === "CASE") {
      level.cases.push(lineIndent());
    }
    prev = t;
  }
  return out.replace(/[ \t]+$/gm, "").trim() + "\n";
}
