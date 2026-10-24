/**
 * A line diff for showing a pull request's changes, like `git diff`: the longest common
 * subsequence of lines, then hunks with a few lines of context around each change.
 */

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** 1-based line numbers in the old and new text; absent on the side the line is not in. */
  oldLine?: number;
  newLine?: number;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/** Above this many line pairs the table would be too big; show a full replacement instead. */
const MAX_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  const out: DiffLine[] = [];
  if (n * m > MAX_CELLS) {
    a.forEach((text, i) => out.push({ kind: "del", text, oldLine: i + 1 }));
    b.forEach((text, j) => out.push({ kind: "add", text, newLine: j + 1 }));
    return out;
  }
  // lcs[i][j]: length of the longest common subsequence of a[i..] and b[j..].
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (
      i < n &&
      (j === m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
    ) {
      // Removals before additions, as git shows them.
      out.push({ kind: "del", text: a[i], oldLine: i + 1 });
      i++;
    } else {
      out.push({ kind: "add", text: b[j], newLine: j + 1 });
      j++;
    }
  }
  return out;
}

/** Groups changes into hunks with `context` unchanged lines around them. */
export function hunks(lines: readonly DiffLine[], context = 3): Hunk[] {
  const changed = lines.flatMap((line, index) =>
    line.kind === "same" ? [] : [index],
  );
  const ranges: [number, number][] = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(lines.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  return ranges.map(([start, end]) => {
    const slice = lines.slice(start, end + 1);
    // Where the hunk starts on each side: its first line there, or just after the line before.
    const before = lines.slice(0, start);
    const oldStart =
      slice.find((l) => l.oldLine)?.oldLine ??
      before.filter((l) => l.kind !== "add").length;
    const newStart =
      slice.find((l) => l.newLine)?.newLine ??
      before.filter((l) => l.kind !== "del").length;
    return {
      oldStart,
      oldLines: slice.filter((l) => l.kind !== "add").length,
      newStart,
      newLines: slice.filter((l) => l.kind !== "del").length,
      lines: slice,
    };
  });
}

export function diffStats(lines: readonly DiffLine[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const line of lines)
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  return { added, removed };
}
