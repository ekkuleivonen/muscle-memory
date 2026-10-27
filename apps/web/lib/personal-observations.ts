import type { AttemptSummary } from "../../../packages/developer-profile/derive";
import {
  SMALL_EDIT_UNITS,
  type MetricId,
} from "../../../packages/developer-profile/registry";
import type { ChallengeSummary } from "./challenges";
import type { Progress } from "./progress";
export interface PersonalObservation {
  id: string;
  title: string;
  text: string;
  definition: string;
  evidence: AttemptSummary[];
  missing: number;
}
export interface EvidenceAction {
  label: string;
  why: string;
  href: string;
}
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
/** Deterministic descriptions of retained evidence, never inferred ability/attention. */
export function personalObservations(
  attempts: readonly AttemptSummary[],
): PersonalObservation[] {
  const observations: PersonalObservation[] = [];
  const eligible = (ids: MetricId[]) =>
    attempts.filter(
      (a) =>
        !a.issues.length && ids.every((id) => typeof a.values[id] === "number"),
    );
  const add = (
    id: string,
    title: string,
    text: string,
    definition: string,
    evidence: AttemptSummary[],
  ) =>
    observations.push({
      id,
      title,
      text,
      definition,
      evidence,
      missing: attempts.length - evidence.length,
    });
  const submits = eligible(["firstSubmit"]);
  if (submits.length)
    add(
      "first-submit",
      "First check outcomes",
      `${submits.filter((a) => a.values.firstSubmit === 1).length} of ${submits.length} eligible attempts passed on the first submission; the others had failed checks, fired rules or a genuine user-code error. This describes the tasks you tried, not your general ability.`,
      "First submission, same recorded attempt/revision, with all cases passing and no fired static rules. Infrastructure/undecided errors are not unsuccessful user submissions.",
      submits,
    );
  const between = eligible(["editsBetweenRuns", "betweenRuns"]);
  if (between.length)
    add(
      "checkpoints",
      "How you used checkpoints",
      `Between finished checks and the next check, you made a median ${median(between.map((a) => a.values.editsBetweenRuns!)).toFixed(1)} edits, with a median ${(median(between.map((a) => a.values.betweenRuns!)) / 1000).toFixed(1)} seconds between checks. These intervals exclude runner wait.`,
      "Medians of within-attempt medians over same-source terminal-to-next-queue pairs; each attempt has equal weight. Pauses do not prove thinking/confusion.",
      between,
    );
  const edits = eligible(["smallEdits", "largeEdits", "paste", "undo"]);
  if (edits.length) {
    const small = edits.reduce((n, a) => n + a.values.smallEdits!, 0),
      large = edits.reduce((n, a) => n + a.values.largeEdits!, 0);
    add(
      "editing",
      "Your edit sizes",
      `Your retained traces contain ${small} edits of at most ${SMALL_EDIT_UNITS} inserted/deleted characters and ${large} larger edits, alongside ${edits.reduce((n, a) => n + a.values.undo!, 0)} explicit undo and ${edits.reduce((n, a) => n + a.values.paste!, 0)} paste actions. Size, undo and paste describe solution evolution; they do not establish mistakes, waste or outside help.`,
      "Sum of transactions with complete CodeMirror change sets; characters are UTF-16 units. Oversized/missing changes make the attempt ineligible for size totals.",
      edits,
    );
  }
  const recovery = eligible([
    "recoveries",
    "userErrors",
    "runnerErrors",
    "timeouts",
  ]);
  if (recovery.length)
    add(
      "recovery",
      "Working past failed checks",
      `There were ${recovery.reduce((n, a) => n + a.values.recoveries!, 0)} observed user-check improvements across ${recovery.length} eligible attempts. ${recovery.reduce((n, a) => n + a.values.userErrors!, 0)} user-code error runs are separate from ${recovery.reduce((n, a) => n + a.values.runnerErrors!, 0)} runner failures and ${recovery.reduce((n, a) => n + a.values.timeouts!, 0)} timeouts. Reaching tests after a compile/runtime error counts as progress, not necessarily completion.`,
      "Same-source submission transitions: pre-test user error to decided tests, more passing tests, or all tests passing with fired rules cleared. Infrastructure failures are excluded; no unseen recovery is inferred.",
      recovery,
    );
  const answers = attempts.filter((a) => a.completed && a.answers.difficulty);
  if (answers.length && observations.length < 4)
    add(
      "reflection",
      "How completed tasks felt",
      `${answers.filter((a) => ["hard", "too-hard"].includes(a.answers.difficulty)).length} of ${answers.length} retained completed attempts were retrospectively marked hard or too hard. Compare those answers with their actual checks in the timelines; successful-completer answers cannot establish prediction accuracy.`,
      "Latest optional post-completion difficulty answers, from successful completers only.",
      answers,
    );
  if (!observations.length)
    add(
      "empty",
      "Your observed profile starts with a trace",
      "No eligible personal behavior observation is available yet. A new challenge can provide a trace of testing, editing and recovery; an unattempted task is not a failed task.",
      "Needs supported capture and the events needed for each observation.",
      [],
    );
  if (observations.length < 3)
    add(
      "coverage",
      "Keep the limits with the evidence",
      `${attempts.filter((a) => a.issues.length).length} retained attempts have capture issues. Missing events cannot be replaced with zeroes, and already-compacted history needs an approved private history source.`,
      "Source positions, conflict/truncation checks and retained-history coverage; more play cannot reconstruct lost events.",
      attempts.filter((a) => a.issues.length),
    );
  if (observations.length < 3)
    add(
      "scope",
      "Only the conditions you actually tried",
      "Language, topic and difficulty coverage show where these observations came from. Fresh tasks broaden task coverage; familiar-task repeats must stay separate from fresh-task growth.",
      "Current catalog metadata and retained attempt context, without a global ability score.",
      [],
    );
  return observations.slice(0, 4);
}
export function evidenceActions(
  catalog: readonly ChallengeSummary[],
  progress: Progress,
  attempts: readonly AttemptSummary[],
): EvidenceAction[] {
  const actions: EvidenceAction[] = [];
  const unresolved = catalog.filter(
    (c) => progress[c.key] && !progress[c.key].completedAt,
  );
  const ranked = unresolved
    .map((c) => ({
      c,
      a: attempts.find((a) => a.attempt === progress[c.key].attempt),
    }))
    .sort(
      (x, y) =>
        (y.a?.values.userErrors ?? 0) - (x.a?.values.userErrors ?? 0) ||
        x.c.key.localeCompare(y.c.key),
    );
  if (ranked[0]) {
    const { c, a } = ranked[0];
    actions.push({
      label: `Return to ${c.key}`,
      href: `/challenges/${c.key}`,
      why: a?.issues.length
        ? "This attempt is unfinished and its retained capture has gaps. You can continue the task; returning cannot reconstruct the missing records."
        : (a?.values.userErrors ?? 0) > 0
          ? "This unfinished attempt has a recorded user-code error. Another check can show whether the code reaches tests or completes; runner failures are counted separately."
          : "This task is still unfinished. Returning adds an observed continuation instead of treating unresolved work as a failure.",
    });
  }
  const touched = catalog.filter((c) => progress[c.key]);
  const languageCounts = new Map<string, number>();
  for (const c of touched)
    if (c.language)
      languageCounts.set(c.language, (languageCounts.get(c.language) ?? 0) + 1);
  const language = [...languageCounts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];
  const topics = new Set(
    touched.filter((c) => c.language === language).flatMap((c) => [...c.tags]),
  );
  const fresh = catalog.filter((c) => c.runnable && !progress[c.key]);
  const next =
    fresh.find(
      (c) => c.language === language && c.tags.some((t) => !topics.has(t)),
    ) ??
    fresh.find((c) => c.language === language) ??
    fresh[0];
  if (next) {
    const novel = next.tags.find((t) => !topics.has(t));
    actions.push({
      label: `Explore ${next.key}`,
      href: `/challenges/${next.key}`,
      why:
        language && next.language === language && novel
          ? `You have started ${language} tasks, but none tagged ${novel} in this catalog. This task adds that topic to your observed coverage; it does not prove transfer or unlock a rank.`
          : touched.length
            ? `This ${next.language ?? "new"} task has not been started on this device. It adds fresh-task evidence separately from repeated familiar tasks.`
            : "This runnable task can provide your first observed editing/testing trace. No profile answer is required.",
    });
  }
  if (attempts.some((a) => a.issues.length))
    actions.push({
      label: "Inspect missing evidence",
      href: "#evidence-coverage",
      why: "Some traces contain missing/conflicting records. The evidence panel explains which observations are unavailable; demographic answers or another challenge cannot repair those records.",
    });
  return actions.slice(0, 3);
}
