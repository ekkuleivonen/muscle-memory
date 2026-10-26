export interface StatsRow {
  challenge: string;
  revision: string;
  starts: number;
  browserIds: number;
  completions: number;
  submissions: number;
  runs: number;
  missingStarts: number;
}
export interface StatsResult {
  rows: StatsRow[];
  coverage: {
    observed: number;
    duplicates: number;
    conflicts: number;
    knownSynthetic: number;
    unsupported: number;
    firstObserved: string | null;
    lastObserved: string | null;
    lastReceived: string | null;
  };
}
function count(v: unknown): number {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
    throw new Error("Invalid aggregate count.");
  return n;
}
function time(v: unknown): string | null {
  if (v === null) return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    throw new Error("Invalid coverage timestamp.");
  return new Date(v).toISOString();
}
/** Explicit projection: upstream extra fields, IDs, payloads and secrets never reach React. */
export function statsResult(value: unknown): StatsResult {
  if (!Array.isArray(value) || value.length < 1 || value.length > 501)
    throw new Error(
      "Statistics exceed this view's limit; narrow the date or challenge filter.",
    );
  const coverage = value.filter((r) => r?.scope === "coverage");
  if (coverage.length !== 1) throw new Error("Missing aggregate coverage.");
  const c = coverage[0];
  const seen = new Set<string>();
  const rows = value
    .filter((r) => r?.scope !== "coverage")
    .map((r) => {
      if (
        r?.scope !== "challenge" ||
        typeof r.challenge !== "string" ||
        !/^[A-Z][A-Z0-9]{0,4}-\d{3}$/.test(r.challenge) ||
        typeof r.challenge_revision !== "string" ||
        !/^sha256:[0-9a-f]{64}$/.test(r.challenge_revision)
      )
        throw new Error("Invalid challenge aggregate.");
      const key = r.challenge + r.challenge_revision;
      if (seen.has(key)) throw new Error("Duplicate challenge aggregate.");
      seen.add(key);
      const result = {
        challenge: r.challenge,
        revision: r.challenge_revision,
        starts: count(r.starts),
        browserIds: count(r.browser_ids),
        completions: count(r.completions),
        submissions: count(r.submissions),
        runs: count(r.runs),
        missingStarts: count(r.missing_starts),
      };
      if (
        result.completions > result.starts ||
        result.browserIds > result.starts
      )
        throw new Error("Inconsistent aggregate counts.");
      return result;
    });
  return {
    rows,
    coverage: {
      observed: count(c.observed),
      duplicates: count(c.duplicates),
      conflicts: count(c.conflicts),
      knownSynthetic: count(c.known_synthetic),
      unsupported: count(c.unsupported),
      firstObserved: time(c.first_observed),
      lastObserved: time(c.last_observed),
      lastReceived: time(c.last_received),
    },
  };
}
export function completionRate(
  row: Pick<StatsRow, "starts" | "completions">,
): string {
  return row.starts
    ? `${((100 * row.completions) / row.starts).toFixed(1)}% (${row.completions}/${row.starts})`
    : "Unavailable (no recorded starts)";
}
