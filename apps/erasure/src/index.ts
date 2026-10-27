/**
 * The erasure Worker: a daily cron that runs the erasure (erasure.ts) with the Python job in a
 * Cloudflare Container (tools/erasure/server.py), so player rows never leave Cloudflare. The
 * Worker reads tombstones and writes erasure records through its R2 binding; the container
 * only deletes rows, with the catalog token. No fetch handler: nothing reaches it from outside.
 */
import { DurableObject } from "cloudflare:workers";
import { run } from "./erasure";

const PORT = 8080;
/** How long the container gets to start listening before the run gives up. */
const START_TIMEOUT_MS = 120_000;

/**
 * The container's Durable Object. The account uses the "durable_object" scheduling policy, so
 * the image and size are chosen here when the container starts, not in wrangler.jsonc.
 */
export class EraseJob extends DurableObject<Env> {
  /** Starts the container, has it delete these participants' rows, and stops it again. */
  async erase(participants: string[]): Promise<Record<string, number>> {
    const container = this.ctx.container;
    if (!container) throw new Error("No container is attached to this Durable Object.");
    if (!container.running)
      container.start({
        image: container.images.job,
        instance: "standard-1",
        enableInternet: true,
        env: {
          CATALOG_URI: this.env.CATALOG_URI,
          WAREHOUSE: this.env.WAREHOUSE,
          EVENTS_TABLE: this.env.EVENTS_TABLE,
          CATALOG_TOKEN: this.env.CATALOG_TOKEN ?? "",
        },
      });
    const exited = container.monitor().then(
      () => "the container exited",
      (cause) => `the container failed: ${cause}`,
    );
    try {
      const job = container.getTcpPort(PORT);
      await listening(job, exited);
      const response = await job.fetch("http://container/erase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participants }),
      });
      if (!response.ok) throw new Error(`Erasure failed (${response.status}): ${await response.text()}`);
      return ((await response.json()) as { removed: Record<string, number> }).removed;
    } finally {
      await container.destroy().catch(() => undefined);
    }
  }
}

/** Waits until the container answers on its port; fails early if it exits first. */
async function listening(job: Fetcher, exited: Promise<string>): Promise<void> {
  let stopped: string | null = null;
  void exited.then((reason) => (stopped = reason));
  const deadline = Date.now() + START_TIMEOUT_MS;
  for (;;) {
    try {
      if ((await job.fetch("http://container/")).ok) return;
    } catch {
      // Not listening yet.
    }
    if (stopped) throw new Error(`The erasure job didn't start: ${stopped}.`);
    if (Date.now() > deadline) throw new Error("The erasure job didn't start in time.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.CATALOG_TOKEN) throw new Error("CATALOG_TOKEN is not set; nothing was erased.");
    const job = env.JOB.getByName("daily");
    const result = await run(env.CONTROL, (participants) => job.erase(participants), new Date());
    console.log(
      `${result.requests} deletion requests; removed ${result.rows} rows of ${result.participants} participants.`,
    );
  },
} satisfies ExportedHandler<Env>;
