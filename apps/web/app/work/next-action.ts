import type { MergeBlocker } from "../../lib/merge";

/** Visual priority only: shortcuts and the actual merge gate remain independent. */
export function nextAction(input: {
  done: boolean;
  running: boolean;
  unavailable: boolean;
  openPull: boolean;
  blocker: MergeBlocker | null | undefined;
  stale: boolean;
  localPassed: boolean;
}): "continue" | "cancel" | "retry" | "review" | "push" | "test" {
  if (input.running) return "cancel";
  if (input.unavailable) return "retry";
  if (input.done) return "continue";
  if (
    input.openPull &&
    !input.stale &&
    (input.blocker === null || input.blocker === "review")
  )
    return "review";
  return input.localPassed && !input.stale ? "push" : "test";
}
