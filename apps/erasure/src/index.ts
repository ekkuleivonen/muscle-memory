/**
 * The erasure Worker: a daily cron that runs the erasure (erasure.ts) with the Python job in a
 * Cloudflare Container (tools/erasure/server.py), so player rows never leave Cloudflare. The
 * Worker reads tombstones and writes erasure records through its R2 binding; the container
 * only deletes rows, with the catalog token. No fetch handler: nothing reaches it from outside.
 */
import { Container } from "@cloudflare/containers";
import { run } from "./erasure";

export class EraseJob extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "2m";
  // Read when the container starts; class fields run after the constructor has set this.env.
  envVars = {
    CATALOG_URI: this.env.CATALOG_URI,
    WAREHOUSE: this.env.WAREHOUSE,
    EVENTS_TABLE: this.env.EVENTS_TABLE,
    CATALOG_TOKEN: this.env.CATALOG_TOKEN ?? "",
  };
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.CATALOG_TOKEN) throw new Error("CATALOG_TOKEN is not set; nothing was erased.");
    const job = env.JOB.getByName("daily");
    const result = await run(
      env.CONTROL,
      async (participants) => {
        const response = await job.fetch("http://erasure/erase", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participants }),
        });
        if (!response.ok) throw new Error(`Erasure failed (${response.status}): ${await response.text()}`);
        return ((await response.json()) as { removed: Record<string, number> }).removed;
      },
      new Date(),
    );
    console.log(
      `${result.requests} deletion requests; removed ${result.rows} rows of ${result.participants} participants.`,
    );
  },
} satisfies ExportedHandler<Env>;
