/**
 * The workbench's reading of SQL text for the editor (docs/admin-sql.md): tokens, statements
 * split on semicolons outside strings and comments, and the statement at the cursor. Pure, for
 * the browser. The server's read-only check is in check.ts, on R2 SQL's own parser.
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

/** Text the tokenizer cannot read (an unclosed string or comment), with where. */
export class SqlRejected extends Error {
  constructor(
    message: string,
    readonly at: number | null = null,
  ) {
    super(message);
  }
}

/** Name characters as R2 SQL's dialect reads them: letters (any script, with marks), digits, _ $ @ #. */
const IDENT_START = /^[\p{Alphabetic}_]$/u;
const IDENT_PART = /^[\p{Alphabetic}\p{M}\p{N}_$@#]$/u;
/** The whole code point at `i` (one or two UTF-16 units), so names in any script are read whole. */
const codePoint = (text: string, i: number) => String.fromCodePoint(text.codePointAt(i) ?? 0);
const OPERATORS = [
  "!~~*", "->>", "#>>", "!~*", "!~~", "~~*", "||/", "<=>", "<<", ">>", "<=", ">=", "<>", "!=",
  "==", "||", "::", ":=", "=>", "->", "#>", "@>", "<@", "&&", "!~", "~*", "~~", "^@", "|/", "@@",
];

/** Length of a literal's prefix (E, X, N, B or U&) when one starts a string at `i`, else 0. */
function stringPrefix(text: string, i: number): number {
  if (i > 0 && IDENT_PART.test(text[i - 1])) return 0;
  if (/[EeXxNnBb]/.test(text[i]) && text[i + 1] === "'") return 1;
  if (/[Uu]/.test(text[i]) && text[i + 1] === "&" && text[i + 2] === "'") return 2;
  return 0;
}

/** Splits text into tokens. `backslash` reads `\` inside '…' as an escape. */
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
    } else if (
      IDENT_START.test(codePoint(text, i)) ||
      (/[#@]/.test(c) && i + 1 < text.length && IDENT_PART.test(codePoint(text, i + 1)))
    ) {
      // R2 SQL's dialect allows @, # and $ inside names: read the whole name as one word.
      while (i < text.length && IDENT_PART.test(codePoint(text, i))) i += codePoint(text, i).length;
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
