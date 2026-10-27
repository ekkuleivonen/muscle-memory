// @ts-ignore OpenNext generates this module during the existing production build.
import handler from "./.open-next/worker.js";
import {
  scheduledModelSummaries,
  type SummaryEnvironment,
} from "../../packages/model-runs/scheduled-summary";
import {
  scheduledHumanSummaries,
  type HumanSummaryEnvironment,
} from "../../packages/statistics/scheduled-cohorts";

/** Draft: no live trigger or activation variable is configured. */
export default {
  fetch: handler.fetch,
  async scheduled(
    event: { scheduledTime: number },
    env: SummaryEnvironment & HumanSummaryEnvironment,
  ) {
    const deadline = Date.now() + 10 * 60 * 1000;
    try {
      await scheduledModelSummaries(env, event.scheduledTime);
    } catch {
      /* Independent human work may still succeed. */
    }
    await scheduledHumanSummaries(
      env,
      new Date(),
      fetch,
      Math.max(0, deadline - Date.now()),
    );
  },
};
