/**
 * Version 3 of a shared outcome card: a completed challenge, as a link may carry it.
 *
 * Exactly these facts and nothing else: which challenge, in which language, on which revision,
 * the final full check, and optionally the first full check and how many full checks ran. No
 * timing, speed, example runs, rank or comparison, and nothing about how the person worked:
 * a card cannot verify that, so it never claims it. The referral code `c` is the existing
 * referral mechanism (an arrival noted from a shared link); nothing else tracks anyone.
 *
 * A card is made only from a recorded completion (`practice.completed`) and the submissions
 * recorded before it in the same attempt. Nothing is recomputed or inferred. A link is a brag,
 * not a record: anyone could edit one.
 */
import { CHALLENGE_KEY, type StoredRecord } from "../../../packages/domain/records";

export interface Checks {
  readonly passed: number;
  readonly total: number;
}

export interface Outcome {
  readonly v: 3;
  /** Challenge key, e.g. SQL-002. */
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

interface Submission {
  runId: string;
  at: string;
  seq: number;
  result: string;
  passed: number;
  total: number;
  rules: number;
}

/** One attempt's recorded submissions, in order, and the run that completed it, if any. */
function submissions(
  records: readonly StoredRecord[],
  challenge: string,
  attemptId: string,
): { list: Submission[]; completedRun: string | null } {
  const list: Submission[] = [];
  let completedRun: string | null = null;
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (o.challenge !== challenge || o.attemptId !== attemptId) continue;
      if (o.type === "practice.completed" && typeof o.data?.runId === "string")
        completedRun = o.data.runId;
      if (o.type !== "practice.submitted") continue;
      const { runId, result, passed, total, rules } = o.data ?? {};
      if (typeof runId !== "string" || !checks({ passed, total }) || !Array.isArray(rules))
        continue;
      list.push({
        runId,
        at: String(o.occurredAt),
        seq: Number(o.source?.sequence ?? 0),
        result: String(result),
        passed,
        total,
        rules: rules.length,
      });
    } catch {
      // Unreadable records say nothing.
    }
  }
  list.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  return { list, completedRun };
}

/** The run that completed an attempt, from its recorded completion, or null. */
export function completedRun(
  records: readonly StoredRecord[],
  challenge: string,
  attemptId: string,
): string | null {
  return submissions(records, challenge, attemptId).completedRun;
}

/**
 * The card for an attempt's recorded completion, or null when the records can't support one
 * exactly: the completing submission must be recorded, with every case passed (`total > 0`) and
 * no rule firing. `f` is the attempt's first submission when its cases were all decided (passed
 * or failed, on the same cases), otherwise null; `n` counts the submissions through the
 * completing one, cancelled ones aside.
 */
export function outcomeOf(input: {
  records: readonly StoredRecord[];
  challenge: { id: string; key: string; revision: string };
  attemptId: string;
  language: string;
  referral: string;
}): Outcome | null {
  const revision = /^sha256:([0-9a-f]{64})$/.exec(input.challenge.revision)?.[1];
  if (!revision) return null;
  const { list, completedRun } = submissions(input.records, input.challenge.id, input.attemptId);
  const index = list.findIndex((s) => s.runId === completedRun);
  const final = list[index];
  if (!final || final.result !== "passed" || final.total === 0 || final.passed !== final.total || final.rules)
    return null;
  const through = list.slice(0, index + 1);
  const first = through[0];
  const decided =
    (first.result === "passed" || first.result === "failed") && first.total === final.total;
  return publicOutcome({
    v: 3,
    k: input.challenge.key,
    l: input.language,
    rv: revision,
    o: { passed: final.passed, total: final.total },
    f: decided ? { passed: first.passed, total: first.total } : null,
    n: through.filter((s) => s.result !== "cancelled").length,
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
      CHALLENGE_KEY.test(value.k) &&
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
