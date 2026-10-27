/** A public-example pass belongs to one code revision and one runner instance. Never restored. */
import { casesRun, type Revision } from "../../../../packages/content/model";
import { runFeedback } from "../../../../packages/domain/records";
import type { RunOutcome } from "../../../../packages/runner/runner";
export class ExampleGate {
  private generation = 0;
  private pass: { revision: number; context: object } | null = null;
  invalidate() {
    this.generation++;
    this.pass = null;
  }
  begin() {
    this.invalidate();
    return this.generation;
  }
  finish(
    generation: number,
    revision: number,
    currentRevision: number,
    context: object,
    currentContext: object,
    challenge: Revision,
    outcome: RunOutcome,
  ) {
    if (
      generation !== this.generation ||
      revision !== currentRevision ||
      context !== currentContext
    )
      return;
    if (
      outcome.status !== "completed" ||
      outcome.phase !== "tests" ||
      outcome.error
    )
      return;
    const checks = casesRun(challenge.cases, "examples");
    const feedback = runFeedback(checks, outcome.cases);
    if (checks.length > 0 && feedback.correct === checks.length)
      this.pass = { revision, context };
  }
  allows(revision: number, context: object) {
    return this.pass?.revision === revision && this.pass.context === context;
  }
}
