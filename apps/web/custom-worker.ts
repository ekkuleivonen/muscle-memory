// @ts-ignore OpenNext generates this module during the existing production build.
import handler from "./.open-next/worker.js";
import { scheduledModelSummaries, type SummaryEnvironment } from "../../packages/model-runs/scheduled-summary";

/** Draft: no live trigger or activation variable is configured. */
export default {
  fetch: handler.fetch,
  async scheduled(event: { scheduledTime: number }, env: SummaryEnvironment) {
    await scheduledModelSummaries(env, event.scheduledTime);
  },
};
