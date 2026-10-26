/** Admin-only browser execution. Evidence is operator-submitted, not independent proof. */
import { Runner, engineFor } from "../runner/runner";
import { RUN_TIMEOUT_MS } from "../runner/policy";
import { runtimePin } from "./runtime";
import type { ValidationPlan, ValidationRun } from "./contracts";
export async function runBrowserValidation(
  plan: ValidationPlan,
  host: HTMLElement,
  progress: (message: string) => void = () => {},
  signal?: AbortSignal,
): Promise<ValidationRun[]> {
  if (
    (await runtimePin(plan.revision.language)).fingerprint !==
    plan.runtime.fingerprint
  )
    throw new Error(
      "This browser runtime differs from the saved draft. Reload and save before checking again.",
    );
  const results: ValidationRun[] = [];
  for (const [i, run] of plan.runs.entries()) {
    signal?.throwIfAborted();
    progress(`Checking ${i + 1}/${plan.runs.length}: ${run.id}`);
    const r = plan.revision;
    const runner = new Runner(engineFor(r.language)!, host, {
      timeoutMs: RUN_TIMEOUT_MS,
    });
    const cancel = () => runner.dispose();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const outcome = await runner.run({
        runId: run.id,
        code: run.code,
        filename: r.file,
        language: r.language,
        entrypoint: r.entrypoint,
        ...(r.parameters ? { parameters: r.parameters } : {}),
        ...(r.schema ? { setup: r.schema } : {}),
        ...(r.adapter ? { adapter: r.adapter } : {}),
        inputs: r.cases.map((c) => c.input),
      });
      if (outcome.status === "runner-error")
        throw new Error(
          `${run.id}: runner unavailable (${outcome.phase}). ${outcome.message}`,
        );
      if (outcome.status === "timeout")
        throw new Error(
          `${run.id}: stopped after ${outcome.timeoutMs / 1000}s, the same limit players have. Check this code for slow or non-terminating work.`,
        );
      if (outcome.status === "cancelled")
        throw new Error("Checks stopped. No passing result was saved.");
      if (outcome.phase !== "tests")
        throw new Error(
          `${run.id}: ${outcome.phase} error. ${outcome.error?.message ?? "The code did not reach the test cases."}`,
        );
      results.push({ id: run.id, codeDigest: run.codeDigest, outcome });
    } finally {
      signal?.removeEventListener("abort", cancel);
      runner.dispose();
    }
  }
  return results;
}
