/**
 * Version 3 of a shared outcome card: a completed challenge, as a link may carry it.
 *
 * Exactly these facts and nothing else: which challenge, in which language, on which revision,
 * the final full check, and optionally the first full check and how many full checks ran. No
 * timing, speed, example runs, rank or comparison, and nothing about how the person worked:
 * a card cannot verify that, so it never claims it. The referral code `c` is the existing
 * referral mechanism (an arrival noted from a shared link); nothing else tracks anyone.
 *
 * A card is made only from a recorded completion (`checks-passed`, board capture 7.2.0, written
 * by ENG-328) and the full checks recorded before it in the same attempt. Nothing is
 * recomputed or inferred. Like v2, a link is a brag, not a record: anyone could edit one.
 */
import type { WorkspaceRecord } from "../../../packages/domain/workspace";
import { attemptRecords } from "./attempts";

export interface Checks {
  readonly passed: number;
  readonly total: number;
}

export interface Outcome {
  readonly v: 3;
  /** Challenge key, e.g. DATA-6. */
  readonly k: string;
  /** Language id. */
  readonly l: string;
  /** The checked revision's sha256, hex. */
  readonly rv: string;
  /** The final full check, the one that completed the challenge: every check passed. */
  readonly o: Checks;
  /** The first full check of the attempt, or null when it isn't known. */
  readonly f?: Checks | null;
  /** Full checks run in the attempt, the final one included. */
  readonly n?: number;
  /** The sharer's referral code. */
  readonly c: string;
}

/** A completion as ENG-328's `completions()` reads one. */
export interface RecordedCompletion {
  readonly issue: string;
  readonly revision: string;
  readonly key: string;
  readonly at: string;
  readonly runId: string;
  readonly automatic: boolean;
}

const KEY = /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/;
const LANGUAGE = /^[a-z+#]{1,16}$/;
const REFERRAL = /^[a-z0-9]{6,32}$/;
const HEX = /^[0-9a-f]{64}$/;
const MAX_CASES = 10_000;

const count = (v: unknown, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
const checks = (v: unknown): v is Checks =>
  typeof v === "object" &&
  v !== null &&
  count((v as Checks).passed, MAX_CASES) &&
  count((v as Checks).total, MAX_CASES) &&
  (v as Checks).passed <= (v as Checks).total;

interface FullCheck {
  runId: string;
  at: string;
  seq: number;
  /** The run's terminal status, when recorded. */
  status: string | null;
  /** The recorded full-check result, when there is one. */
  result: { result: string; passed: number; total: number } | null;
}

/** Full checks (purpose `pull-request`) of one issue revision in the records given, in order. */
function fullChecks(
  records: readonly WorkspaceRecord[],
  issue: string,
  revision: string,
): FullCheck[] {
  const byRun = new Map<string, FullCheck>();
  const of = (runId: string, at: string, seq: number) => {
    let check = byRun.get(runId);
    if (!check) {
      check = { runId, at, seq, status: null, result: null };
      byRun.set(runId, check);
    }
    // Ordered by when the run first appears (it is queued before it reports).
    if (at < check.at || (at === check.at && seq < check.seq)) {
      check.at = at;
      check.seq = seq;
    }
    return check;
  };
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (
        o.issue !== issue ||
        o.issueRevision !== revision ||
        typeof o.occurredAt !== "string" ||
        typeof o.data?.runId !== "string"
      )
        continue;
      const seq = Number(o.source?.sequence ?? 0);
      if (
        o.type === "observation.workspace.run" &&
        o.data.purpose === "pull-request"
      ) {
        const check = of(o.data.runId, o.occurredAt, seq);
        if (TERMINAL.has(o.data.status)) check.status = o.data.status;
      } else if (o.type === "observation.workspace.pull-request") {
        const value = { passed: o.data.passed, total: o.data.total };
        const check = of(o.data.runId, o.occurredAt, seq);
        if (checks(value) && typeof o.data.result === "string")
          check.result = { result: o.data.result, ...value };
      }
    } catch {
      // Unreadable records say nothing.
    }
  }
  return [...byRun.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.seq - b.seq,
  );
}

const TERMINAL = new Set([
  "result",
  "user-error",
  "runner-error",
  "timeout",
  "cancelled",
]);

/**
 * The card for a recorded completion, or null when the records can't support one exactly:
 *
 * - the completion must be a recorded `checks-passed` one (a legacy merge stays a v2 card);
 * - its run must be a recorded full check on the completed revision with every check passed
 *   (`total > 0`, `passed = total`);
 * - the completion gate's required deterministic rules for that run's code must have been
 *   evaluated and none left outstanding (`required`, from ENG-328's gate: `[]`; null when
 *   not evaluated refuses).
 *
 * `f` is the first full check of the attempt on that revision, or null when its result is
 * missing or incomplete (errored, cancelled, cut short). `n` counts the full checks that ran
 * (not cancelled) in the attempt through the completing run; nothing after it.
 */
export function outcomeOf(input: {
  records: readonly WorkspaceRecord[];
  completion: RecordedCompletion;
  required: readonly unknown[] | null;
  language: string;
  referral: string;
}): Outcome | null {
  const { completion } = input;
  const revision = /^sha256:([0-9a-f]{64})$/.exec(completion.revision)?.[1];
  if (!completion.automatic || !revision) return null;
  if (!input.required || input.required.length) return null;
  const all = fullChecks(
    attemptRecords(input.records, completion.issue, completion.at),
    completion.issue,
    completion.revision,
  );
  const index = all.findIndex((c) => c.runId === completion.runId);
  const final = all[index]?.result;
  if (
    !final ||
    final.result !== "checks-passed" ||
    final.total === 0 ||
    final.passed !== final.total
  )
    return null;
  const through = all.slice(0, index + 1);
  const first = through[0].result;
  const complete = (r: FullCheck["result"]) =>
    !!r &&
    (r.result === "checks-passed" || r.result === "checks-failed") &&
    r.total === final.total;
  return publicOutcome({
    v: 3,
    k: completion.key,
    l: input.language,
    rv: revision,
    o: { passed: final.passed, total: final.total },
    f: complete(first) ? { passed: first!.passed, total: first!.total } : null,
    n: through.filter((c) => c.status !== "cancelled").length,
    c: input.referral,
  });
}

/** Only the allowlisted fields, so anything spread in stays out of links. */
export function publicOutcome(card: Outcome): Outcome {
  return {
    v: 3,
    k: card.k,
    l: card.l,
    rv: card.rv,
    o: { passed: card.o.passed, total: card.o.total },
    ...(card.f !== undefined
      ? { f: card.f && { passed: card.f.passed, total: card.f.total } }
      : {}),
    ...(card.n !== undefined ? { n: card.n } : {}),
    c: card.c,
  };
}

const toBase64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/** The card as a URL path segment: base64url of its public fields' JSON. */
export function encodeOutcome(card: Outcome): string {
  return toBase64url(
    new TextEncoder().encode(JSON.stringify(publicOutcome(card))),
  );
}

const FIELDS = new Set(["v", "k", "l", "rv", "o", "f", "n", "c"]);

/** Longer than any card we make: refused before decoding. */
const MAX_SEGMENT = 1024;

/** A v3 card from a link, or null when it is not one we would have made. */
export function decodeOutcome(segment: string): Outcome | null {
  try {
    if (segment.length > MAX_SEGMENT || !/^[A-Za-z0-9_-]+$/.test(segment))
      return null;
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (c) => c.charCodeAt(0)),
      ),
    );
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    const ok =
      value.v === 3 &&
      Object.keys(value).every((k) => FIELDS.has(k)) &&
      typeof value.k === "string" &&
      KEY.test(value.k) &&
      typeof value.l === "string" &&
      LANGUAGE.test(value.l) &&
      typeof value.rv === "string" &&
      HEX.test(value.rv) &&
      checks(value.o) &&
      value.o.total > 0 &&
      value.o.passed === value.o.total &&
      (value.f === undefined ||
        value.f === null ||
        (checks(value.f) && value.f.total === value.o.total)) &&
      (value.n === undefined || (count(value.n, 100_000) && value.n >= 1)) &&
      typeof value.c === "string" &&
      REFERRAL.test(value.c);
    return ok ? publicOutcome(value) : null;
  } catch {
    return null;
  }
}

/**
 * What a card says, in words a person could post: "I completed …" for the sharer's own text,
 * "Completed …" on the page. Checks with their actual counts; never a claim about the person's
 * ability or about tools outside the editor.
 */
export function outcomeSentence(
  card: Pick<Outcome, "k" | "o">,
  language: string,
  title?: string,
  voice: "first" | "third" = "third",
): string {
  const named = title ? `“${title}” (${card.k})` : card.k;
  return `${voice === "first" ? "I completed" : "Completed"} ${named} in ${language}. All ${card.o.total} checks passed.`;
}

/** The card's rows: the facts it carries, and nothing it doesn't. */
export function outcomeLines(card: Outcome): [string, string, boolean?][] {
  return [
    ["checks passed", `${card.o.passed}/${card.o.total}`, true],
    ...(card.f !== undefined
      ? [
          [
            "first full check",
            card.f ? `${card.f.passed}/${card.f.total}` : "not known",
          ] as [string, string],
        ]
      : []),
    ...(card.n !== undefined
      ? [["full checks run", String(card.n)] as [string, string]]
      : []),
  ];
}
