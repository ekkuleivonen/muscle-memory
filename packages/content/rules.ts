/**
 * Rules read code as text (docs/challenges.md): patterns and size metrics, the same in every
 * language, so the same code always gives the same answer and can be re-checked later.
 */
import type { Rule, RuleTrigger } from "./model";

/** Editable files' text by path. */
export type Files = Readonly<Record<string, string>>;

export function fires(trigger: RuleTrigger, files: Files): boolean {
  if ("all" in trigger) return trigger.all.every((t) => fires(t, files));
  if ("any" in trigger) return trigger.any.some((t) => fires(t, files));
  if ("not" in trigger) return !fires(trigger.not, files);
  if ("metric" in trigger)
    return texts(files, trigger.file).some(
      ([path, text]) => metric(trigger.metric, text, path) > trigger.above,
    );
  const pattern = new RegExp(trigger.pattern, "m");
  const found = texts(files, trigger.file).some(([, text]) => pattern.test(text));
  return found === trigger.present;
}

/** The rules this code breaks, in their order. */
export function broken(rules: readonly Rule[], files: Files): Rule[] {
  return rules.filter((rule) => fires(rule.when, files));
}

/** The named file, or every editable file. */
function texts(files: Files, file?: string): [string, string][] {
  const all = Object.entries(files);
  return file ? all.filter(([path]) => path === file) : all;
}
const INDENTED = /\.(py|rb)$/;
const CONTROL = /^\s*(}\s*)?(if|else|for|foreach|while|do|switch|case|catch|try|finally|with|return|elif|unless|until)\b/;

/**
 * lines: non-blank lines. nesting: the deepest block, by braces or, in Python and Ruby, by
 * indentation. function-lines: the longest function, from its signature to its end.
 */
export function metric(
  name: "lines" | "function-lines" | "nesting",
  text: string,
  path: string,
): number {
  const lines = strip(text, INDENTED.test(path)).split("\n");
  if (name === "lines") return lines.filter((l) => l.trim()).length;
  return INDENTED.test(path) ? byIndent(name, lines) : byBraces(name, lines);
}

/** Drops string literals and line comments, so braces inside them do not count. */
function strip(text: string, hashComments: boolean): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, (s) =>
      s.replace(/[^\n]/g, " "),
    )
    .replace(hashComments ? /#.*$/gm : /\/\/.*$/gm, "");
}

function byBraces(name: "function-lines" | "nesting", lines: string[]): number {
  let depth = 0;
  let deepest = 0;
  let longest = 0;
  const open: { line: number; fn: boolean }[] = [];
  lines.forEach((line, index) => {
    for (const char of line) {
      if (char === "{") {
        depth++;
        deepest = Math.max(deepest, depth);
        // A block whose line has a parameter list and is not a control statement.
        open.push({ line: index, fn: line.includes("(") && !CONTROL.test(line) });
      } else if (char === "}") {
        depth = Math.max(0, depth - 1);
        const block = open.pop();
        if (block?.fn) longest = Math.max(longest, index - block.line + 1);
      }
    }
  });
  return name === "nesting" ? deepest : longest;
}

function byIndent(name: "function-lines" | "nesting", lines: string[]): number {
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.length - l.trimStart().length);
  const unit = Math.min(...indents.filter((i) => i > 0), Infinity);
  if (name === "nesting")
    return unit === Infinity ? 0 : Math.max(...indents.map((i) => Math.floor(i / unit)));
  let longest = 0;
  lines.forEach((line, index) => {
    if (!/^\s*def\s/.test(line)) return;
    const indent = line.length - line.trimStart().length;
    let end = index;
    for (let next = index + 1; next < lines.length; next++) {
      const text = lines[next];
      if (!text.trim()) continue;
      if (text.length - text.trimStart().length <= indent) break;
      end = next;
    }
    longest = Math.max(longest, end - index + 1);
  });
  return longest;
}
