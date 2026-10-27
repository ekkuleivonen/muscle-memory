/**
 * Turning returned rows into text: what a cell shows, what copying gives, and CSV/JSON exports.
 * Pure, for the browser.
 */

/** A value as plain text: NULL for null, JSON for objects, the value itself otherwise. */
export function plain(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Objects and arrays, or strings holding one (JSON payload columns), parsed; otherwise null. */
export function structured(value: unknown): object | null {
  if (value && typeof value === "object") return value as object;
  if (typeof value !== "string") return null;
  const s = value.trimStart();
  if (!(s.startsWith("{") || s.startsWith("[")) || value.length > 5_000_000) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Spreadsheets run a cell starting with = + - @ (or a tab or carriage return before one) as a
 * formula. Such text gets a leading apostrophe; numbers are numbers and are left alone.
 */
export function defuse(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
    ? String(value)
    : defuse(plain(value));
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * CSV (RFC 4180, CRLF) with a BOM so spreadsheets read UTF-8. NULL becomes an empty field, as
 * CSV has no null; JSON keeps the difference.
 */
export function toCsv(columns: string[], rows: readonly unknown[][]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Rows as JSON objects. Duplicate column names get a suffix so no value is lost. */
export function toJson(columns: string[], rows: readonly unknown[][]): string {
  const keys = uniqueKeys(columns);
  return JSON.stringify(
    rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? null]))),
    null,
    2,
  );
}

/** Keys for JSON rows: a repeated name gets the first free `_2`, `_3`, … not used by any column. */
export function uniqueKeys(columns: string[]): string[] {
  const taken = new Set(columns);
  const seen = new Set<string>();
  return columns.map((c) => {
    if (!seen.has(c)) {
      seen.add(c);
      return c;
    }
    let n = 2;
    while (taken.has(`${c}_${n}`)) n++;
    const key = `${c}_${n}`;
    taken.add(key);
    return key;
  });
}

/** Tab-separated, for pasting into a spreadsheet: tabs and newlines in values become spaces. */
export function toTsv(columns: string[], rows: readonly unknown[][]): string {
  const field = (v: unknown) =>
    v === null || v === undefined ? "" : defuse(plain(v)).replace(/[\t\r\n]+/g, " ");
  return [columns.map(field).join("\t"), ...rows.map((r) => r.map(field).join("\t"))].join("\n");
}

/** Compares returned values for a local sort: nulls last, numbers numerically, text by locale. */
export function compareValues(a: unknown, b: unknown): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const as = plain(a);
  const bs = plain(b);
  const numeric = /^-?\d+(\.\d+)?$/;
  if (numeric.test(as) && numeric.test(bs)) return Number(as) - Number(bs);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Bytes for people: 0 B, 12.3 MB. Decimal units, as R2 SQL bills them. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let n = bytes;
  let u = -1;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)} ${units[u]}`;
}
