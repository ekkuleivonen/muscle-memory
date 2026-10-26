import { runFeedback } from "../domain/records";
import { canonical, type Json } from "../domain/json";
import type { ChallengeSource } from "../content/source";
import type { ValidationPlan, ValidationRun, RuntimePin } from "./contracts";
import { AuthoringInvalid, structuralProblems } from "./source";
import { digest } from "./runtime";
export async function validationPlan(
  source: ChallengeSource,
  runtime: RuntimePin,
  generation: number,
  draftDigest: string,
  token: string,
  expiresAt: string,
): Promise<ValidationPlan> {
  const problems = structuralProblems(source);
  if (problems.length)
    throw new AuthoringInvalid(
      "Fix structural validation problems before running QA.",
      problems,
    );
  const code = [
    {
      id: "solution-1",
      code: source.private.solution,
      expect: "correct" as const,
    },
    {
      id: "solution-2",
      code: source.private.solution,
      expect: "correct" as const,
    },
    {
      id: "starter",
      code: source.revision.starter,
      expect: "starter" as const,
    },
    ...source.private.alternatives.map((code, i) => ({
      id: `alternative-${i + 1}`,
      code,
      expect: "correct" as const,
    })),
    ...source.private.wrong.map((code, i) => ({
      id: `wrong-${i + 1}`,
      code,
      expect: "incorrect" as const,
    })),
  ];
  return {
    token,
    generation,
    draftDigest,
    runtime,
    revision: source.revision,
    expiresAt,
    runs: await Promise.all(
      code.map(async (r) => ({ ...r, codeDigest: await digest(r.code) })),
    ),
  };
}
/** Server grades raw terminal results against the exact private source, never a client pass flag.
 * Only the server-owned trusted validator can submit these results to the receipt writer. */
export function validateEvidence(
  plan: ValidationPlan,
  reported: unknown,
): ValidationRun[] {
  if (!Array.isArray(reported) || reported.length !== plan.runs.length)
    throw new AuthoringInvalid("QA must include every planned run.");
  const runs = reported as ValidationRun[];
  const ids = new Set<string>();
  for (const [i, expected] of plan.runs.entries()) {
    const run = runs[i];
    if (
      !run ||
      run.id !== expected.id ||
      run.codeDigest !== expected.codeDigest ||
      ids.has(run.id)
    )
      throw new AuthoringInvalid(
        "QA code or run order differs from the validation plan.",
      );
    ids.add(run.id);
    const out = run.outcome;
    if (
      !out ||
      !["completed", "user-error"].includes(out.status) ||
      !("phase" in out) ||
      out.phase !== "tests" ||
      !("cases" in out) ||
      !Array.isArray(out.cases) ||
      out.cases.length !== plan.revision.cases.length
    )
      throw new AuthoringInvalid(
        `Run ${run.id} did not exercise every case; runner, compile, timeout and cancelled runs cannot pass QA.`,
      );
    if (
      out.cases.some(
        (c, index) => c.index !== index || (c.output && c.output.truncated),
      )
    )
      throw new AuthoringInvalid(
        `Run ${run.id} has incomplete or out-of-order results.`,
      );
    const feedback = runFeedback(plan.revision.cases, out.cases);
    const pass = feedback.correct === feedback.total;
    if (expected.expect === "correct" ? !pass : pass)
      throw new AuthoringInvalid(
        expected.expect === "correct"
          ? `${run.id} did not pass every case.`
          : `${run.id} unexpectedly passes every case.`,
      );
  }
  const outputs = (r: ValidationRun) =>
    canonical(("cases" in r.outcome ? r.outcome.cases : []) as unknown as Json);
  if (outputs(runs[0]) !== outputs(runs[1]))
    throw new AuthoringInvalid(
      "The reference solution is not deterministic across its two runs.",
    );
  return runs;
}
