/**
 * A pilot: real models on a few challenges, one try each, from this machine, to read the
 * transcripts and measure cost before any backfill. Runs are not in the ledger; each run's rows
 * go to `<out>/outbox/<runId>.ndjson` for ./store_events.py, and a summary to `<out>/summary.json`.
 * Reads OPENROUTER_API_KEY from the environment. Logprobs are requested where the model's
 * listing supports them; reasoning is left at each model's default (condition
 * `reasoning: default`).
 *
 *   node --import tsx tools/model-runs/pilot.ts <out> --models a/b,c/d --challenges PY-001,SQL-003
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { revisionId } from "../../packages/content/revision";
import { readChallenges } from "../../packages/content/source";
import type { Json } from "../../packages/domain/json";
import { OPENROUTER } from "../../packages/model-runs/openrouter";
import { PracticeHost } from "./practice";
import { requestFor } from "../../packages/model-runs/admin";
import { runModel } from "../../packages/model-runs/run";
import { writeOutbox } from "./outbox";
import { HARNESS_VERSION } from "../../packages/model-runs/tools";

const root = resolve(import.meta.dirname, "../..");
const [out, ...flags] = process.argv.slice(2);
const option = (name: string) => {
  const at = flags.indexOf(`--${name}`);
  return at >= 0 ? flags[at + 1].split(",") : [];
};
const models = option("models");
const keys = option("challenges");
const apiKey = process.env.OPENROUTER_API_KEY;
if (!out || !models.length || !keys.length || !apiKey)
  throw new Error("usage: OPENROUTER_API_KEY=… pilot.ts <out> --models … --challenges …");

// Only the public revision: the private part (solutions) is never read here.
const challenges = readChallenges(join(root, "content/challenges"))
  .filter((c) => keys.includes(c.metadata.key))
  .map(({ metadata, revision }) => ({ metadata: { ...metadata, revision: revisionId(revision) }, revision }));
const listing = (await (await fetch(`${OPENROUTER}/models`)).json()) as {
  data: { id: string; supported_parameters: string[] }[];
};
const environment: Json = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  node: process.version,
  chromium: chromium.executablePath().split("/").find((p) => p.startsWith("chromium")) ?? null,
  platform: `${process.platform}-${process.arch}`,
  runner: "pilot",
};

const host = await PracticeHost.start();
const summary: Json[] = [];
for (const model of models) {
  const supported = listing.data.find((m) => m.id === model)?.supported_parameters ?? [];
  if (!supported.includes("tools")) throw new Error(`${model} is not listed with tool calling`);
  const request = requestFor({ reasoning: "default" }, supported);
  for (const challenge of challenges) {
    const runId = `pilot-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${challenge.metadata.key.toLowerCase()}`;
    const started = Date.now();
    try {
      const result = await runModel({
        runId,
        model,
        try: 1,
        challenge,
        open: (config) => host.open(config),
        fetch,
        apiKey,
        request,
        assignments: { reasoning: "default" },
        environment,
      });
      await writeOutbox(join(out, "outbox"), runId, result.records, new Date().toISOString());
      const observations = result.records
        .filter((r) => r.kind === "observation")
        .map((r) => JSON.parse(r.payload));
      const usage = observations
        .filter((o) => o.type === "model.response")
        .map((o) => o.data.usage ?? {});
      const sum = (key: string) => usage.reduce((s, u) => s + (Number(u[key]) || 0), 0);
      const line = {
        runId,
        model,
        challenge: challenge.metadata.key,
        outcome: result.outcome,
        reason: result.reason,
        turns: result.turns,
        submissions: result.submissions,
        promptTokens: sum("prompt_tokens"),
        completionTokens: sum("completion_tokens"),
        cost: Math.round(sum("cost") * 1e6) / 1e6,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      summary.push(line);
      console.log(JSON.stringify(line));
    } catch (error) {
      summary.push({ runId, model, challenge: challenge.metadata.key, harnessError: String(error) });
      console.log(`harness failure ${runId}: ${error}`);
    }
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "summary.json"), JSON.stringify({ harness: HARNESS_VERSION, runs: summary }, null, 2));
  }
}
await host.stop();
