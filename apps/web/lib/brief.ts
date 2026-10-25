/**
 * A merged pull request's outcome in a few lines, shown before the full evidence (./evidence):
 * the latest result against the first submission, then at most three lines taken as they are
 * from the full evidence, so the brief never says anything the evidence doesn't. Open pull
 * requests have no brief: the merge gate's verdict is the one place that says what is left.
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

/** "all 12 checks passed", "7 of 12 checks passed", or what happened instead. */
function result(c: Checks): string {
  if (c.legacy) return "CI passed";
  if (c.result === "checks-passed") return `all ${c.total} checks passed`;
  if (c.result === "checks-errored")
    return "CI errored before reaching the tests";
  if (c.result === "cancelled") return "CI was cancelled";
  return `${c.passed} of ${c.total} checks passed`;
}

const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

export function briefOf(facts: EvidenceFacts): Brief | null {
  if (facts.state !== "merged") return null;
  const { first, checks, pushes } = facts;
  let headline: string;
  if (pushes <= 1) headline = `${sentence(result(checks))} on the first push.`;
  else {
    const latest = `${sentence(result(checks))} on push ${pushes}.`;
    headline = !first
      ? `${latest} What CI said on the first push isn't known.`
      : first.result === "checks-passed" &&
          !first.legacy &&
          first.total === checks.total
        ? `${latest} The first push passed too.`
        : `${latest} On the first push, ${result(first)}.`;
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
