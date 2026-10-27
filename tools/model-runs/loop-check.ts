/**
 * The whole loop in a real browser, with a scripted stream instead of a model and no network:
 * each challenge's "model" runs the examples, writes the reference solution and submits it. The
 * run must complete, and the two streams must line up on their shared clock: every practice
 * observation a tool call caused falls between that call and its result.
 *
 *   node --import tsx tools/model-runs/loop-check.ts PY-001 TS-001 SQL-001
 */
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { revisionId } from "../../packages/content/revision";
import { readChallenges } from "../../packages/content/source";
import { PracticeHost } from "./practice";
import { runModel } from "../../packages/model-runs/run";

const root = resolve(import.meta.dirname, "../..");
const only = process.argv.slice(2);
const challenges = readChallenges(join(root, "content/challenges")).filter(
  (c) => !only.length || only.includes(c.metadata.key),
);

const sse = (...events: object[]) =>
  [": OPENROUTER PROCESSING", ...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]", ""].join("\n");
const toolCall = (turn: number, name: string, args: object) =>
  sse(
    { id: `gen-${turn}`, model: "scripted/reference", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${turn}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] },
    { id: `gen-${turn}`, choices: [{ index: 0, delta: { content: "" }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } },
  );

const host = await PracticeHost.start();
const failures: string[] = [];
for (const { metadata: source, revision, private: secret } of challenges) {
  const metadata = { ...source, revision: revisionId(revision) };
  const script = [
    toolCall(1, "run_examples", {}),
    toolCall(2, "write_code", { text: secret.solution }),
    toolCall(3, "submit", {}),
  ];
  const fetcher = (async (url: string) => {
    if (url.endsWith("/chat/completions")) return new Response(script.shift() ?? sse());
    if (url.includes("/generation")) return new Response('{"data":{}}');
    return new Response('{"data":[]}');
  }) as typeof fetch;
  try {
    const result = await runModel({
      runId: `loop-${metadata.key.toLowerCase()}`,
      model: "scripted/reference",
      try: 1,
      challenge: { metadata, revision },
      open: (config) => host.open(config),
      fetch: fetcher,
      apiKey: "none",
      sleep: async () => undefined,
    });
    assert.equal(result.outcome, "completed", result.reason ?? "");
    const observations = result.records
      .filter((r) => r.kind === "observation")
      .map((r) => JSON.parse(r.payload));
    assert.equal(new Set(observations.map((o) => o.sessionId)).size, 1, "one session");
    const practice = new Map(
      observations.filter((o) => o.type.startsWith("practice.")).map((o) => [o.source.sequence, o]),
    );
    const model = observations.filter((o) => o.type.startsWith("model."));
    for (const result of model.filter((o) => o.type === "model.tool-result")) {
      const call = model.find((o) => o.type === "model.tool-call" && o.data.callId === result.data.callId);
      const { from, to } = result.data.practice;
      for (let sequence = from; sequence <= to; sequence++) {
        const caused = practice.get(sequence);
        assert.ok(
          caused.elapsedMs >= call.elapsedMs && caused.elapsedMs <= result.elapsedMs,
          `${caused.type} at ${caused.elapsedMs} ms is outside ${call.data.name} (${call.elapsedMs}–${result.elapsedMs} ms)`,
        );
      }
    }
    console.log(
      `ok   ${metadata.key}: ${practice.size} practice and ${model.length} model observations, streams aligned`,
    );
  } catch (error) {
    failures.push(`FAIL ${metadata.key}: ${(error as Error).message}`);
  }
}
await host.stop();
for (const failure of failures) console.log(failure);
process.exit(failures.length ? 1 : 0);
