/**
 * Deterministic triggers for teammate comments and hints (docs/issue-model.md). A trigger is
 * evaluated against facts derived from recorded data only, so the same code and the same
 * behaviour release the same feedback for everyone, and it can be re-evaluated later.
 * Metrics and patterns read the code as text, so they work the same in every language.
 */
import type { Trigger } from "./model";

export interface Behaviour {
  /** Distinct minutes with an edit or a run since the last progress. */
  readonly activeMinutesWithoutProgress: number;
  /** Local runs since the last progress. */
  readonly runsWithoutProgress: number;
  /** Pull request pushes (opening included) whose checks did not all pass. */
  readonly failingPushes: number;
}

export interface Facts {
  /** What just happened, if anything: a pull request opened (push 1) or pushed to (2+). */
  readonly event?: "opened" | "pull-request" | "push";
  /** The editable files' text by path: the pushed code at a push, else the current code. */
  readonly files: Readonly<Record<string, string>>;
  /** Case id → passed, from the latest pull request checks; absent before the first. */
  readonly cases?: Readonly<Record<string, boolean>>;
  readonly behaviour: Behaviour;
}

export function evaluate(trigger: Trigger, facts: Facts): boolean {
  if ("all" in trigger) return trigger.all.every((t) => evaluate(t, facts));
  if ("any" in trigger) return trigger.any.some((t) => evaluate(t, facts));
  if ("not" in trigger) return !evaluate(trigger.not, facts);
  if ("event" in trigger) return facts.event === trigger.event;
  if ("metric" in trigger)
    return texts(facts, trigger.file).some(
      ([path, text]) => metric(trigger.metric, text, path) > trigger.above,
    );
  if ("pattern" in trigger) {
    const pattern = new RegExp(trigger.pattern, "m");
    const found = texts(facts, trigger.file).some(([, text]) => pattern.test(text));
    return found === trigger.present;
  }
  if ("check" in trigger) {
    const passed = facts.cases?.[trigger.check];
    return passed !== undefined && passed === (trigger.is === "passing");
  }
  const value = {
    "active-minutes-without-progress": facts.behaviour.activeMinutesWithoutProgress,
    "runs-without-progress": facts.behaviour.runsWithoutProgress,
    "failing-pushes": facts.behaviour.failingPushes,
  }[trigger.behaviour];
  return value >= trigger.atLeast;
}

/** The named file, or every editable file. */
function texts(facts: Facts, file?: string): [string, string][] {
  const all = Object.entries(facts.files);
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

/** Which wording of a comment a person sees: stable per person and comment. */
export function wordingFor(participantId: string, commentId: string, count: number): number {
  let hash = 2166136261;
  for (const char of `${participantId}:${commentId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % Math.max(1, count);
}
