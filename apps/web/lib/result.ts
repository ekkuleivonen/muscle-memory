/**
 * The result card shown when a pull request is merged, and the shared link that carries it:
 * what happened, never a score or a rank. Its numbers come from this browser's records; the
 * link carries them in its path, so anyone can open it without the sharer's data, and nobody
 * should trust it more than a screenshot. It carries the device's referral code, never the
 * participant ID.
 */
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

export interface Result {
  /** Issue key, e.g. QUICK-4. */
  readonly k: string;
  /** Language id. */
  readonly l: string;
  /** Distinct minutes with activity in the IDE, up to the merge. */
  readonly m: number;
  /** Test runs (Run tests). */
  readonly r: number;
  /** Pushes to pull requests, opening included. */
  readonly p: number;
  /** Hints received. */
  readonly h: number;
  /** The sharer's referral code. */
  readonly c: string;
}

const ACTIVE = new Set([
  "observation.workspace.edit",
  "observation.workspace.keys",
  "observation.workspace.selection",
  "observation.workspace.scroll",
  "observation.workspace.clipboard",
  "observation.workspace.run",
]);
const TERMINAL = new Set(["result", "user-error", "runner-error", "timeout", "cancelled"]);

/** The numbers for one issue, from everything recorded for it up to `until`. */
export function resultOf(
  records: readonly WorkspaceRecord[],
  issue: string,
  until: string,
): Pick<Result, "m" | "r" | "p" | "h"> {
  const minutes = new Set<number>();
  let runs = 0;
  let pushes = 0;
  let hints = 0;
  for (const record of records) {
    if (record.kind !== "observation") continue;
    let o: { type?: string; issue?: string; occurredAt?: string; data?: Record<string, unknown> };
    try {
      o = JSON.parse(record.payload);
    } catch {
      continue;
    }
    if (o.issue !== issue || !o.occurredAt || o.occurredAt > until) continue;
    const type = String(o.type);
    if (ACTIVE.has(type)) minutes.add(Math.floor(Date.parse(o.occurredAt) / 60000));
    if (
      type === "observation.workspace.run" &&
      o.data?.purpose !== "pull-request" &&
      TERMINAL.has(String(o.data?.status))
    )
      runs++;
    if (type === "observation.workspace.pull-request") pushes++;
    if (type === "observation.workspace.hint") hints++;
  }
  return { m: Math.max(1, minutes.size), r: runs, p: pushes, h: hints };
}

/** The card as a URL path segment: base64url of its JSON. */
export function encodeResult(result: Result): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const count = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

/** A card from a link, or null when it is not one we would have made. */
export function decodeResult(segment: string): Result | null {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    const ok =
      typeof value?.k === "string" &&
      /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/.test(value.k) &&
      typeof value.l === "string" &&
      /^[a-z+#]{1,16}$/.test(value.l) &&
      count(value.m, 100_000) &&
      count(value.r, 100_000) &&
      count(value.p, 100_000) &&
      count(value.h, 100) &&
      typeof value.c === "string" &&
      /^[a-z0-9]{6,32}$/.test(value.c);
    return ok ? { k: value.k, l: value.l, m: value.m, r: value.r, p: value.p, h: value.h, c: value.c } : null;
  } catch {
    return null;
  }
}

/** One sentence that says what happened, for the card and for posts. */
export function sentence(result: Result, language: string): string {
  const minutes = `${result.m} minute${result.m === 1 ? "" : "s"}`;
  const runs = `${result.r} test run${result.r === 1 ? "" : "s"}`;
  const hints = result.h ? `${result.h} hint${result.h === 1 ? "" : "s"}` : "no hints";
  return `Fixed a real bug in ${language} without AI: ${minutes}, ${runs}, ${hints}.`;
}
