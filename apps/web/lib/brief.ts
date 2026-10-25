/**
 * A completed challenge's outcome in a few lines, shown before the full evidence (./evidence):
 * the latest result against the first submission, then at most three lines taken as they are
 * from the full evidence, so the brief never says anything the evidence doesn't. Until it is
 * complete there is no brief: the check feedback says what is left.
 */
import {
  describe,
  type EvidenceFacts,
  type EvidenceItem,
  type Submission,
} from "./evidence";

export interface Brief {
  /** Latest result, then the first submission's when they differ: one or two sentences. */
  headline: string;
  /** The first submission's checks are not known. */
  firstMissing: boolean;
  /** Whether the pushed code was tested first, CI-only checks, and any missing evidence. */
  items: EvidenceItem[];
}

type Checks = Pick<Submission, "result" | "passed" | "total" | "legacy">;

/** "all 12 cases passed", "7 of 12 cases passed", or what happened instead. */
function result(c: Checks): string {
  if (c.legacy) return "every case passed";
  if (c.result === "checks-passed") return `all ${c.total} cases passed`;
  // A compile error, a crash or a timeout part-way through all record as errored: the stage and
  // cause aren't known, so say only that the checks didn't finish.
  if (c.result === "checks-errored") return "the checks did not complete";
  if (c.result === "cancelled") return "the check was cancelled";
  return `${c.passed} of ${c.total} cases passed`;
}

const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

export function briefOf(facts: EvidenceFacts): Brief | null {
  if (facts.state !== "merged") return null;
  const { first, checks, pushes } = facts;
  let headline: string;
  if (pushes <= 1) headline = `${sentence(result(checks))} on the first check.`;
  else {
    const latest = `${sentence(result(checks))} on check ${pushes}.`;
    headline = !first
      ? `${latest} What the first check showed isn't known.`
      : first.result === "checks-passed" &&
          !first.legacy &&
          first.total === checks.total
        ? `${latest} The first check passed too.`
        : `${latest} On the first check, ${result(first)}.`;
  }
  const sections = describe(facts);
  const item = (section: string, id: string) =>
    sections.find((s) => s.id === section)?.items.find((i) => i.id === id);
  const items = [
    item("verification", "before-push") ?? item("verification", "runs"),
    item("regression", "hidden"),
    item("changed", "gaps") ?? item("changed", "code"),
  ].filter((i): i is EvidenceItem => !!i);
  return { headline, firstMissing: pushes > 1 && !first, items };
}
