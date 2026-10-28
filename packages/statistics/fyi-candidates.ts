/**
 * Which of a player's attempts a tiny comparison may describe: solved, on the challenge's current
 * revision, with exactly one recorded runtime and editor setup and no AI completion. Newest first,
 * at most three, so Stats requests a bounded number of comparison reads.
 */
import type { AttemptSummary } from "../developer-profile/derive";

/** The catalog fields a comparison needs; the web ChallengeSummary satisfies it. */
export interface CatalogEntry {
  key: string;
  revision: string;
  title: string;
}
export interface FyiCandidate {
  attempt: AttemptSummary;
  title: string;
  /** Canonical runtime JSON from the attempt's own recorded setup. */
  runtime: string;
}
export const MAX_FYI_CANDIDATES = 3;

export function fyiCandidates(
  attempts: readonly AttemptSummary[],
  catalog: readonly CatalogEntry[],
  practice: readonly AttemptSummary["practice"][],
): FyiCandidate[] {
  const current = new Map(catalog.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const out: FyiCandidate[] = [];
  const newest = [...attempts].sort(
    (a, b) => b.last.localeCompare(a.last) || a.attempt.localeCompare(b.attempt),
  );
  for (const a of newest) {
    if (out.length === MAX_FYI_CANDIDATES) break;
    if (seen.has(a.attempt)) continue;
    seen.add(a.attempt);
    const c = current.get(a.challenge);
    if (!a.completed || !c || c.revision !== a.revision || !practice.includes(a.practice))
      continue;
    const runtimes = a.conditions.filter((s) => s.startsWith("Runtime: "));
    const editors = a.conditions.filter((s) => s.startsWith("Editor: "));
    if (runtimes.length !== 1 || editors.length !== 1) continue;
    if (/autocomplete|ai-completion|copilot/i.test(editors[0])) continue;
    out.push({ attempt: a, title: c.title, runtime: runtimes[0].slice(9) });
  }
  return out;
}
