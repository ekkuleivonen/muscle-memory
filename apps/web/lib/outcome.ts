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

/**
 * The card for a recorded completion, or null when the records can't support one exactly: a
 * completion that isn't a `checks-passed` one (a legacy merge stays a v2 card), or a final
 * full check that isn't recorded as passing every check on the completed revision.
 */
export function outcomeOf(input: {
  records: readonly WorkspaceRecord[];
  completion: RecordedCompletion;
  language: string;
  referral: string;
}): Outcome | null {
  const { completion } = input;
  const revision = /^sha256:([0-9a-f]{64})$/.exec(completion.revision)?.[1];
  if (!completion.automatic || !revision) return null;
  const full: { at: string; seq: number; runId: string; checks: Checks }[] = [];
  for (const record of attemptRecords(
    input.records,
    completion.issue,
    completion.at,
  )) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (
        o.type === "observation.workspace.pull-request" &&
        o.issue === completion.issue &&
        o.issueRevision === completion.revision &&
        typeof o.occurredAt === "string" &&
        o.occurredAt <= completion.at
      ) {
        const value = { passed: o.data?.passed, total: o.data?.total };
        if (checks(value))
          full.push({
            at: o.occurredAt,
            seq: o.source?.sequence ?? 0,
            runId: String(o.data.runId),
            checks: value,
          });
      }
    } catch {
      // Unreadable records say nothing.
    }
  }
  full.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  const final = full.find((f) => f.runId === completion.runId);
  if (!final || final.checks.total === 0) return null;
  if (final.checks.passed !== final.checks.total) return null;
  const upTo = full.slice(0, full.indexOf(final) + 1);
  return publicOutcome({
    v: 3,
    k: completion.key,
    l: input.language,
    rv: revision,
    o: final.checks,
    f: upTo[0].checks,
    n: upTo.length,
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

/** A v3 card from a link, or null when it is not one we would have made. */
export function decodeOutcome(segment: string): Outcome | null {
  try {
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
