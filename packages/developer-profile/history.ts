import type { StoreDump } from "../browser/practice-store";
import { deriveAttempts, type AttemptSummary } from "./derive";
import { METRIC_VERSION, SUMMARY_KEY, METRICS, type Values } from "./registry";

/** Local authorized dump only. This function has no network transport or public ID lookup. */
export function localHistory(dump: StoreDump): AttemptSummary[] {
  const participant = dump.settings.participantId;
  if (!participant) return [];
  let saved: AttemptSummary[] = [];
  try {
    const parsed = JSON.parse(dump.settings[SUMMARY_KEY] ?? "[]");
    if (Array.isArray(parsed))
      saved = parsed.filter(
        (s) =>
          s?.version === METRIC_VERSION &&
          s.participant === participant &&
          typeof s.attempt === "string" &&
          typeof s.challenge === "string" &&
          typeof s.revision === "string" &&
          typeof s.last === "string" &&
          (s.started === null || typeof s.started === "string") &&
          s.answers &&
          typeof s.answers === "object" &&
          Array.isArray(s.conditions) &&
          s.conditions.every((c: unknown) => typeof c === "string") &&
          s.values &&
          Array.isArray(s.issues) &&
          Array.isArray(s.timeline),
      );
  } catch {
    /* Current raw evidence remains usable; a corrupt summary is not zero. */
  }
  saved = saved.map((s) => ({
    ...s,
    values: Object.fromEntries(
      Object.keys(METRICS).map((k) => {
        const value = s.values[k as keyof Values];
        return [
          k,
          typeof value === "number" && Number.isFinite(value) && value >= 0
            ? value
            : null,
        ];
      }),
    ) as Values,
  }));
  const merged = new Map(
    saved.map((s) => [JSON.stringify([s.attempt, s.revision]), s]),
  );
  for (const s of deriveAttempts(dump.records, participant))
    merged.set(JSON.stringify([s.attempt, s.revision]), s);
  const list = [...merged.values()].sort(
    (a, b) =>
      (a.started ?? a.last).localeCompare(b.started ?? b.last) ||
      a.attempt.localeCompare(b.attempt),
  );
  // First-ever status cannot be proved from a compacted history. Explicit again is a repeat;
  // a later attempt after an observed completion is also repeat practice.
  const completed = new Set<string>();
  return list.map((s) => {
    const result = {
      ...s,
      practice: completed.has(s.challenge) ? ("repeat" as const) : s.practice,
    };
    if (s.completed) completed.add(s.challenge);
    return result;
  });
}
