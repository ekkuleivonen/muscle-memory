import type { PracticeObservation, PracticeData } from "../domain/practice";
import { CHALLENGE_KEY, REVISION, type StoredRecord } from "../domain/records";
import { canonical, type Json } from "../domain/json";
import { orderSource } from "../domain/source-order";
import {
  ACTIVE_GAP_MS,
  SMALL_EDIT_UNITS,
  BURST_GAP_MS,
  METRICS,
  METRIC_VERSION,
  type Values,
} from "./registry";

export interface AttemptSummary {
  version: typeof METRIC_VERSION;
  participant: string;
  attempt: string;
  challenge: string;
  revision: string;
  started: string | null;
  last: string;
  completed: boolean;
  practice: "first" | "repeat" | "unknown";
  issues: string[];
  values: Values;
  answers: Record<string, string>;
  timeline: { at: string; label: string }[];
  conditions: string[];
}
const median = (ns: number[]) => {
  if (!ns.length) return null;
  const s = ns.sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
/** Decode CodeMirror's array of unchanged lengths and [deleted, ...inserted lines]. */
export function editVolume(
  changes: unknown,
): { inserted: number; deleted: number } | null {
  if (!Array.isArray(changes)) return null;
  let inserted = 0,
    deleted = 0;
  for (const part of changes) {
    if (Number.isSafeInteger(part) && part >= 0) continue;
    if (
      !Array.isArray(part) ||
      !Number.isSafeInteger(part[0]) ||
      part[0] < 0 ||
      !part.slice(1).every((x) => typeof x === "string")
    )
      return null;
    deleted += part[0];
    inserted += part.slice(1).join("\n").length;
  }
  return { inserted, deleted };
}
const data = <T extends keyof PracticeData>(
  o: PracticeObservation,
  type: T,
): PracticeData[T] | null =>
  o.type === type ? (o.data as PracticeData[T]) : null;

/** Pure and code-free output. Deduplicate by stored record_id before interpreting anything. */
export function deriveAttempts(
  records: readonly StoredRecord[],
  participant: string,
): AttemptSummary[] {
  const unique = new Map<string, StoredRecord>(),
    conflicts = new Set<string>();
  for (const r of records) {
    if (r.participantId !== participant) continue;
    const prior = unique.get(r.recordId);
    if (prior && prior.payload !== r.payload) conflicts.add(r.recordId);
    else unique.set(r.recordId, r);
  }
  const groups = new Map<string, PracticeObservation[]>();
  let malformed = false;
  for (const r of unique.values()) {
    if (r.kind !== "observation") continue;
    try {
      const o = JSON.parse(r.payload) as PracticeObservation;
      if (!o.type?.startsWith("practice.") || o.actor !== "person") continue;
      if (
        o.participantId !== participant ||
        o.observationId !== r.recordId ||
        !o.attemptId ||
        !CHALLENGE_KEY.test(o.challenge ?? "") ||
        !REVISION.test(o.challengeRevision ?? "") ||
        !o.source?.id ||
        !Number.isFinite(o.elapsedMs) ||
        !Number.isFinite(Date.parse(o.occurredAt)) ||
        !o.data
      ) {
        malformed = true;
        continue;
      }
      const key = JSON.stringify([
        o.attemptId,
        o.challenge,
        o.challengeRevision,
      ]);
      const group = groups.get(key) ?? [];
      group.push(o);
      groups.set(key, group);
    } catch {
      malformed = true;
    }
  }
  return [...groups.values()].map((group) => {
    try {
      return summarize(group, conflicts, malformed);
    } catch {
      const o = group[0];
      return {
        version: METRIC_VERSION,
        participant,
        attempt: o.attemptId!,
        challenge: o.challenge!,
        revision: o.challengeRevision!,
        started: null,
        last: o.occurredAt,
        completed: false,
        practice: "unknown",
        issues: ["Malformed practice data; derived values are unavailable."],
        values: Object.fromEntries(
          Object.keys(METRICS).map((k) => [k, null]),
        ) as Values,
        answers: {},
        timeline: [],
        conditions: [],
      } satisfies AttemptSummary;
    }
  });
}
function summarize(
  group: PracticeObservation[],
  conflicts: Set<string>,
  malformed: boolean,
): AttemptSummary {
  const issues: string[] = [];
  if (malformed)
    issues.push(
      "Some local records could not be read; eligibility is withheld.",
    );
  if (group.some((o) => conflicts.has(o.observationId)))
    issues.push("Conflicting record IDs.");
  if (
    group.some(
      (o) =>
        o.captureVersion !== "practice-capture-1.2.0" &&
        o.captureVersion !== "practice-capture-1.1.0",
    )
  )
    issues.push("Unsupported capture version.");
  const sources = new Map<string, PracticeObservation[]>();
  for (const o of group) {
    const s = sources.get(o.source.id) ?? [];
    s.push(o);
    sources.set(o.source.id, s);
  }
  for (const [id, observations] of sources) {
    const order = orderSource(
      group[0].participantId,
      id,
      observations.map((o) => ({
        observationId: o.observationId,
        sequence: o.source.sequence,
      })),
    );
    if (
      order.missing.positionCount ||
      order.conflicts.length ||
      order.unordered.length
    )
      issues.push("Missing or conflicting source positions.");
    observations.sort((a, b) => a.source.sequence - b.source.sequence);
    if (
      observations.some(
        (o, i) => i > 0 && o.elapsedMs < observations[i - 1].elapsedMs,
      )
    )
      issues.push("Non-monotonic source clock.");
  }
  // Wall clock orders sources only; sequence always orders observations within a source.
  const orderedSources = [...sources.values()].sort(
    (a, b) =>
      a[0].occurredAt.localeCompare(b[0].occurredAt) ||
      a[0].source.id.localeCompare(b[0].source.id),
  );
  const os = orderedSources.flat();
  const start = os.find((o) => o.type === "practice.started");
  if (!start)
    issues.push(
      "Attempt start is missing; this may be latest-only or partial history.",
    );
  if (os.some((o) => o.type === "practice.capture-gap"))
    issues.push("Capture reported lost records.");
  const v = Object.fromEntries(
    Object.keys(METRICS).map((k) => [k, null]),
  ) as Values;
  const runMap = new Map<string, PracticeObservation[]>();
  for (const o of os) {
    const r = data(o, "practice.run");
    if (r) {
      const list = runMap.get(r.runId) ?? [];
      list.push(o);
      runMap.set(r.runId, list);
    }
  }
  const terminal = (o: PracticeObservation) => {
    const r = data(o, "practice.run");
    return r && r.status !== "queued" && r.status !== "running";
  };
  const submissions = os.filter((o) => o.type === "practice.submitted");
  const decided = submissions.filter((o) => {
    const s = data(o, "practice.submitted")!;
    const runs = runMap.get(s.runId) ?? [];
    return (
      s.total > 0 &&
      (s.result === "passed" || s.result === "failed") &&
      runs.some((r) => {
        const d = data(r, "practice.run")!;
        return d.status === "result" || d.status === "user-error";
      })
    );
  });
  const terminalRuns = [...runMap.values()].flatMap((runs) =>
    runs.filter(terminal).slice(0, 1),
  );
  const preTestUserError = (o: PracticeObservation) => {
    const r = data(o, "practice.run");
    const phase = (r?.outcome as { phase?: string } | undefined)?.phase;
    return (
      r?.status === "user-error" && (phase === "compile" || phase === "runtime")
    );
  };
  const userFailed = (o: PracticeObservation) => {
    const s = data(o, "practice.submitted")!;
    return (
      s.result === "errored" &&
      (runMap.get(s.runId) ?? []).some(preTestUserError)
    );
  };
  const recoverable = submissions.filter(
    (o) => decided.includes(o) || userFailed(o),
  );
  const improves = (
    before: PracticeObservation,
    after: PracticeObservation,
  ) => {
    const b = data(before, "practice.submitted")!,
      a = data(after, "practice.submitted")!;
    return (
      before.source.id === after.source.id &&
      after.source.sequence > before.source.sequence &&
      b.total === a.total &&
      decided.includes(after) &&
      (userFailed(before) ||
        a.passed > b.passed ||
        (b.rules.length > 0 && a.rules.length === 0 && a.result === "passed"))
    );
  };
  const edits = os.filter((o) => o.type === "practice.edit");
  const times: number[] = [],
    editCounts: number[] = [],
    keyIntervals: number[] = [];
  let wait = 0,
    waitComplete = true,
    active = 0,
    bursts = 0,
    pauses = 0,
    corrections = 0,
    navigation = 0,
    elapsed = 0,
    typedIntervals = 0,
    typingMs = 0;
  for (const runs of runMap.values()) {
    const q = runs.find((o) => data(o, "practice.run")!.status === "queued");
    const ends = runs.filter(terminal),
      end = ends[0];
    if (
      !q ||
      ends.length !== 1 ||
      q.source.id !== end.source.id ||
      end.elapsedMs < q.elapsedMs
    )
      waitComplete = false;
    else wait += end.elapsedMs - q.elapsedMs;
  }
  for (const source of orderedSources) {
    elapsed += Math.max(0, source.at(-1)!.elapsedMs - source[0].elapsedMs);
    let lastKey: number | null = null,
      // The previous keydown, if it typed a code character; any other key breaks the chain.
      lastTyped: number | null = null,
      lastInteraction: number | null = null,
      lastRun: PracticeObservation | null = null;
    const interactions: number[] = [];
    for (const o of source) {
      const keys = data(o, "practice.keys");
      if (keys)
        for (const [at, kind, key, , modifiers, repeat] of keys.keys)
          if (kind === "down" && !repeat) {
            if (
              !Number.isFinite(at) ||
              at < 0 ||
              (lastKey !== null && at < lastKey)
            ) {
              issues.push("Invalid per-key timing.");
              continue;
            }
            if (lastKey === null || at - lastKey > BURST_GAP_MS) {
              bursts++;
              if (lastKey !== null) pauses++;
            } else keyIntervals.push(at - lastKey);
            // A code character: one character, typed without Ctrl, Alt or Meta (Shift is typing).
            const typed = [...key].length === 1 && !/[CAM]/.test(modifiers ?? "");
            if (typed && lastTyped !== null && at - lastTyped <= BURST_GAP_MS) {
              typedIntervals++;
              typingMs += at - lastTyped;
            }
            lastTyped = typed ? at : null;
            lastKey = at;
            interactions.push(at);
            if (key === "Backspace" || key === "Delete") corrections++;
            if (
              /^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(key)
            )
              navigation++;
          }
      if (o.type === "practice.edit" || o.type === "practice.selection")
        interactions.push(o.elapsedMs);
      if (data(o, "practice.run")?.status === "queued" && lastRun) {
        times.push(o.elapsedMs - lastRun.elapsedMs);
        editCounts.push(
          source.filter(
            (e) =>
              e.type === "practice.edit" &&
              e.source.sequence > lastRun!.source.sequence &&
              e.source.sequence < o.source.sequence,
          ).length,
        );
      }
      if (terminal(o)) lastRun = o;
    }
    interactions.sort((a, b) => a - b);
    for (const at of interactions) {
      if (lastInteraction !== null && at - lastInteraction <= ACTIVE_GAP_MS)
        active += at - lastInteraction;
      lastInteraction = at;
    }
  }
  if (!issues.length) {
    for (const k of [
      "edits",
      "undo",
      "paste",
      "smallEdits",
      "largeEdits",
      "inserted",
      "deleted",
      "blur",
      "hidden",
      "hover",
      "diagnostics",
      "recoveries",
      "userErrors",
      "userErrorRecoveries",
      "unclassifiedErrors",
      "runnerErrors",
      "loadingFailures",
      "timeouts",
      "cancellations",
      "returns",
    ] as const)
      v[k] = 0;
    v.edits = edits.length;
    let volumeKnown = true;
    for (const o of edits) {
      const e = data(o, "practice.edit")!;
      const volume = e.changesTruncated ? null : editVolume(e.changes);
      if (!volume) volumeKnown = false;
      else {
        v.inserted! += volume.inserted;
        v.deleted! += volume.deleted;
        v[
          volume.inserted + volume.deleted <= SMALL_EDIT_UNITS
            ? "smallEdits"
            : "largeEdits"
        ]!++;
      }
      if (/^undo(\.|$)/.test(e.userEvent ?? "")) v.undo!++;
      if (/^input\.paste(\.|$)/.test(e.userEvent ?? "")) v.paste!++;
    }
    if (!volumeKnown)
      for (const k of [
        "inserted",
        "deleted",
        "smallEdits",
        "largeEdits",
      ] as const)
        v[k] = null;
    v.runs = runMap.size;
    v.examples = [...runMap.values()].filter(
      (rs) => data(rs[0], "practice.run")!.purpose === "examples",
    ).length;
    v.submissions = [...runMap.values()].filter(
      (rs) => data(rs[0], "practice.run")!.purpose === "submit",
    ).length;
    for (const [metric, type] of [
      ["firstEdit", "practice.edit"],
      ["firstRun", "practice.run"],
    ] as const) {
      const first = os.find((o) => o.type === type);
      if (start && first && first.source.id === start.source.id)
        v[metric] = first.elapsedMs - start.elapsedMs;
    }
    const firstSubmit = submissions[0];
    if (
      firstSubmit &&
      (decided.includes(firstSubmit) || userFailed(firstSubmit))
    )
      v.firstSubmit =
        data(firstSubmit, "practice.submitted")!.result === "passed" &&
        data(firstSubmit, "practice.submitted")!.rules.length === 0
          ? 1
          : 0;
    v.betweenRuns = median(times);
    v.editsBetweenRuns = median(editCounts);
    v.runnerWait = waitComplete ? wait : null;
    v.bursts = bursts;
    v.pauses = pauses;
    v.keyInterval = median(keyIntervals);
    v.typedKeys = typedIntervals;
    v.typingTime = typingMs;
    v.active = active;
    v.corrections = corrections;
    v.navigation = navigation;
    v.elapsed = elapsed;
    let closed = false,
      completed = false,
      hidden = false;
    for (const o of os) {
      if (data(o, "practice.focus")?.focused === false) v.blur!++;
      const page = data(o, "practice.page");
      if (page) {
        if (!page.visible && !hidden) v.hidden!++;
        hidden = !page.visible;
      }
      const assist = data(o, "practice.assist");
      if (assist) v[assist.kind === "hover" ? "hover" : "diagnostics"]!++;
      if (o.type === "practice.completed") completed = true;
      if (o.type === "practice.opened" && closed && !completed) {
        v.returns!++;
        closed = false;
      }
      if (o.type === "practice.closed") closed = true;
    }
    v.unclassifiedErrors = submissions.filter((o) => {
      const s = data(o, "practice.submitted")!;
      if (s.result !== "errored" || userFailed(o)) return false;
      return !(runMap.get(s.runId) ?? []).some((r) =>
        ["runner-error", "timeout", "cancelled"].includes(
          data(r, "practice.run")!.status,
        ),
      );
    }).length;
    v.userErrors = terminalRuns.filter(
      (o) => data(o, "practice.run")!.status === "user-error",
    ).length;
    v.runnerErrors = terminalRuns.filter(
      (o) => data(o, "practice.run")!.status === "runner-error",
    ).length;
    v.timeouts = terminalRuns.filter(
      (o) => data(o, "practice.run")!.status === "timeout",
    ).length;
    v.cancellations = terminalRuns.filter(
      (o) => data(o, "practice.run")!.status === "cancelled",
    ).length;
    v.loadingFailures = os.filter(
      (o) => data(o, "practice.runtime")?.state === "unavailable",
    ).length;
    v.userErrorRecoveries = terminalRuns.filter(
      (f) =>
        preTestUserError(f) &&
        terminalRuns.some(
          (a) =>
            a.source.id === f.source.id &&
            a.source.sequence > f.source.sequence &&
            data(a, "practice.run")!.purpose ===
              data(f, "practice.run")!.purpose &&
            ["result", "user-error"].includes(
              data(a, "practice.run")!.status,
            ) &&
            (data(a, "practice.run")!.outcome as { phase?: string } | undefined)
              ?.phase === "tests",
        ),
    ).length;
    for (let i = 1; i < recoverable.length; i++)
      if (improves(recoverable[i - 1], recoverable[i])) v.recoveries!++;
    const failed = recoverable.find(
      (o) =>
        userFailed(o) ||
        data(o, "practice.submitted")!.result === "failed" ||
        data(o, "practice.submitted")!.rules.length > 0,
    );
    if (failed) {
      const improved = recoverable.find((o) => improves(failed, o));
      if (improved) {
        v.recoveryChecks = new Set(
          os
            .filter(
              (o) =>
                o.source.id === failed.source.id &&
                o.source.sequence > failed.source.sequence &&
                o.source.sequence < improved.source.sequence &&
                data(o, "practice.run")?.status === "queued",
            )
            .map((o) => data(o, "practice.run")!.runId),
        ).size;
        v.recoveryTime = improved.elapsedMs - failed.elapsedMs;
        v.recoveryEdits = edits.filter(
          (o) =>
            o.source.id === failed.source.id &&
            o.source.sequence > failed.source.sequence &&
            o.source.sequence < improved.source.sequence,
        ).length;
      }
    }
  }
  const answers: Record<string, string> = {};
  if (os.some((o) => o.type === "practice.completed"))
    for (const o of os) {
      const a = data(o, "practice.answered");
      if (a) answers[a.question] = a.answer;
    }
  const timeline: AttemptSummary["timeline"] = [];
  for (const o of os) {
    const s = data(o, "practice.submitted"),
      r = data(o, "practice.run");
    let label: string | null = null;
    if (s)
      label = `${s.result}: ${s.passed}/${s.total} checks; ${s.rules.length} static rules`;
    else if (r && terminal(o)) label = `${r.purpose}: ${r.status}`;
    else if (o.type === "practice.snapshot")
      label = `Code checkpoint (${data(o, "practice.snapshot")!.reason})`;
    else if (
      [
        "practice.started",
        "practice.opened",
        "practice.completed",
        "practice.closed",
        "practice.capture-gap",
      ].includes(o.type)
    )
      label = o.type.slice(9);
    if (label) timeline.push({ at: o.occurredAt, label });
  }
  const conditions = [
    ...new Set(
      os.flatMap((o) => {
        const opened = data(o, "practice.opened");
        return opened
          ? [
              `Editor: ${opened.editor.name}; features: ${opened.editor.features.join(", ")}`,
              `Runtime: ${canonical(opened.runtime as Json)}`,
            ]
          : [];
      }),
    ),
  ];
  return {
    version: METRIC_VERSION,
    participant: os[0].participantId,
    attempt: os[0].attemptId!,
    challenge: os[0].challenge!,
    revision: os[0].challengeRevision!,
    started: start?.occurredAt ?? null,
    last: os.at(-1)!.occurredAt,
    completed: os.some((o) => o.type === "practice.completed"),
    practice:
      data(start ?? os[0], "practice.started")?.from === "again"
        ? "repeat"
        : "unknown",
    issues: [...new Set(issues)],
    values: v,
    answers,
    timeline: timeline.slice(-200),
    conditions,
  };
}
