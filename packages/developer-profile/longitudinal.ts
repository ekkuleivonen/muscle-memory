import type { AttemptSummary } from "./derive";
import {
  REPEAT_METRICS,
  REPEAT_MIN_ATTEMPTS,
  REPEAT_WINDOW_DAYS,
} from "./registry";

type RepeatMetric = (typeof REPEAT_METRICS)[number];
export interface RepeatWindowValue {
  sample: number;
  median: number | null;
}
export interface RepeatHistoryGroup {
  challenge: string;
  revision: string;
  conditions: readonly string[];
  earlier: number;
  recent: number;
  evidence: {
    attempt: string;
    revision: string;
    started: string;
    window: "earlier" | "recent";
  }[];
  metrics: Record<
    RepeatMetric,
    { earlier: RepeatWindowValue; recent: RepeatWindowValue }
  >;
}
export interface RepeatHistory {
  earlierFrom: string;
  recentFrom: string;
  until: string;
  excluded: number;
  groups: RepeatHistoryGroup[];
}
/** Same-task descriptive history, not skill growth. No network, storage or new capture.
 * Only explicit repeat evidence, completed attempts, supported capture and one recorded
 * editor/runtime condition qualify. Actual external assistance remains unknown.
 */
export function repeatHistory(
  attempts: readonly AttemptSummary[],
  until: string,
): RepeatHistory {
  const end = Date.parse(until);
  if (!Number.isFinite(end))
    throw new Error("Repeat history needs a valid end time.");
  const width = REPEAT_WINDOW_DAYS * 86400000;
  const result: RepeatHistory = {
    earlierFrom: new Date(end - 2 * width).toISOString(),
    recentFrom: new Date(end - width).toISOString(),
    until: new Date(end).toISOString(),
    excluded: 0,
    groups: [],
  };
  const groups = new Map<
    string,
    {
      example: AttemptSummary;
      earlier: AttemptSummary[];
      recent: AttemptSummary[];
    }
  >();
  const unique = new Map<string, AttemptSummary>();
  const conflicts = new Set<string>();
  for (const a of attempts) {
    const id = JSON.stringify([
      a.participant,
      a.challenge,
      a.revision,
      a.attempt,
    ]);
    const prior = unique.get(id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(a)) conflicts.add(id);
    else unique.set(id, a);
  }
  // Never combine participants, including in private imports/test inputs.
  const participants = new Set([...unique.values()].map((a) => a.participant));
  if (participants.size > 1) return { ...result, excluded: unique.size };
  for (const [id, a] of unique) {
    const at = Date.parse(a.started ?? "");
    const conditions = [...new Set(a.conditions)].sort();
    const knownCondition =
      conditions.length === 2 &&
      conditions.some((c) => c.startsWith("Editor: ")) &&
      conditions.some((c) => c.startsWith("Runtime: "));
    if (
      conflicts.has(id) ||
      !a.completed ||
      a.practice !== "repeat" ||
      a.issues.length ||
      !Number.isFinite(at) ||
      at < end - 2 * width ||
      at >= end ||
      !knownCondition
    ) {
      result.excluded++;
      continue;
    }
    const key = JSON.stringify([a.challenge, a.revision, conditions]);
    const group = groups.get(key) ?? { example: a, earlier: [], recent: [] };
    group[at < end - width ? "earlier" : "recent"].push(a);
    groups.set(key, group);
  }
  for (const { example, earlier, recent } of groups.values()) {
    const summary = (
      list: AttemptSummary[],
      metric: RepeatMetric,
    ): RepeatWindowValue => {
      const values = list
        .map((a) => a.values[metric])
        .filter(
          (v): v is number =>
            typeof v === "number" && Number.isFinite(v) && v >= 0,
        )
        .sort((a, b) => a - b);
      const i = Math.floor(values.length / 2);
      return {
        sample: values.length,
        median:
          values.length < REPEAT_MIN_ATTEMPTS
            ? null
            : values.length % 2
              ? values[i]
              : (values[i - 1] + values[i]) / 2,
      };
    };
    result.groups.push({
      challenge: example.challenge,
      revision: example.revision,
      conditions: [...new Set(example.conditions)].sort(),
      earlier: earlier.length,
      recent: recent.length,
      evidence: [
        ...earlier.map((a) => ({
          attempt: a.attempt,
          revision: a.revision,
          started: a.started!,
          window: "earlier" as const,
        })),
        ...recent.map((a) => ({
          attempt: a.attempt,
          revision: a.revision,
          started: a.started!,
          window: "recent" as const,
        })),
      ].sort(
        (a, b) =>
          a.started.localeCompare(b.started) ||
          a.attempt.localeCompare(b.attempt),
      ),
      metrics: Object.fromEntries(
        REPEAT_METRICS.map((metric) => [
          metric,
          {
            earlier: summary(earlier, metric),
            recent: summary(recent, metric),
          },
        ]),
      ) as RepeatHistoryGroup["metrics"],
    });
  }
  result.groups.sort(
    (a, b) =>
      a.challenge.localeCompare(b.challenge) ||
      a.revision.localeCompare(b.revision) ||
      JSON.stringify(a.conditions).localeCompare(JSON.stringify(b.conditions)),
  );
  return result;
}
