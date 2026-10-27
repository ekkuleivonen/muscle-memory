import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChallengeMetadata, Revision } from "../content/model";
import type { StoredRecord } from "../domain/records";
import { addLine, assembled, settle } from "./openrouter";
import type { Edited, Ran, Range } from "./practice";
import { runModel, type Practice } from "./run";
import { parseCall } from "./tools";

const revision: Revision = {
  challenge: "PY-900",
  task: "Synthetic harness fixture: return the supplied value.",
  language: "python",
  file: "fixture.py",
  starter: "def fixture(value):\n    return None\n",
  entrypoint: "fixture",
  cases: [
    { id: "a", name: "empty", input: 17, expected: 17, hidden: false },
    { id: "b", input: 23, expected: 23, hidden: true },
  ],
  rules: [],
} as unknown as Revision;
const metadata = {
  key: "PY-900",
  title: "Synthetic harness fixture",
  revision: "sha256:" + "c".repeat(64),
} as unknown as ChallengeMetadata;

/** Practice without a browser: edits change a string, a Submit completes once the code says so. */
function fakePractice(): Practice & { calls: string[] } {
  let code = revision.starter;
  let position = 2;
  const range = (n: number): Range => ({ from: position + 1, to: (position += n) });
  const edited = (applied: boolean): Edited => ({
    applied,
    code,
    diagnostics: null,
    practice: applied ? range(1) : null,
  });
  return {
    calls: [],
    opened: { runtimeLabel: "Python 3.14", typeChecked: false },
    records: [] as StoredRecord[],
    async edit(old, replacement) {
      this.calls.push("edit");
      if (code.split(old).length !== 2) return edited(false);
      code = code.replace(old, replacement);
      return edited(true);
    },
    async write(text) {
      this.calls.push("write");
      code = text;
      return edited(true);
    },
    async run(purpose): Promise<Ran> {
      this.calls.push(purpose);
      const complete = purpose === "submit" && code.includes("return value");
      return {
        run: {
          runId: "r",
          revision: 1,
          status: "result",
          purpose,
          outcome: {
            status: "completed",
            phase: "tests",
            cases: [{ output: { text: complete ? "0" : "1", truncated: false } }],
            stdout: { text: "", truncated: false, bytes: 0 },
            stderr: { text: "", truncated: false, bytes: 0 },
            durationMs: 3,
          },
          ...(purpose === "submit"
            ? { verdict: { result: complete ? "passed" : "failed", passed: complete ? 2 : 0, total: 2, rules: [], complete } }
            : {}),
        } as unknown as Ran["run"],
        completed: complete,
        practice: range(purpose === "submit" ? 4 : 3),
      };
    },
    async close() {
      return range(1);
    },
  };
}

const sse = (...events: (object | string)[]) =>
  events.map((e) => (typeof e === "string" ? e : `data: ${JSON.stringify(e)}`)).join("\n") + "\n";

/** A streamed body, split into network reads at awkward places (mid-line). */
function streamed(text: string, status = 200, headers: Record<string, string> = {}): Response {
  const bytes = new TextEncoder().encode(text);
  const cut = [0, 7, Math.floor(bytes.length / 2), bytes.length];
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 1; i < cut.length; i++) controller.enqueue(bytes.slice(cut[i - 1], cut[i]));
        controller.close();
      },
    }),
    { status, headers: { "content-type": "text/event-stream", ...headers } },
  );
}

const call = (id: string, name: string, args: string, extra: object = {}) => ({
  id: "gen-" + id,
  model: "test/model",
  provider: "TestCloud",
  choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: args } }] }, ...extra }],
});
const usage = (id: string, finish: string) => ({
  id: "gen-" + id,
  choices: [{ index: 0, delta: { content: "" }, finish_reason: finish, native_finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
});

function fakeFetch(chat: (() => Response)[]) {
  const seen: { url: string; body?: string; headers: Record<string, string> }[] = [];
  const generationTries = new Map<string, number>();
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, body: init.body as string | undefined, headers: init.headers as Record<string, string> });
    if (url.endsWith("/chat/completions")) {
      const next = chat.shift();
      if (!next) throw new Error("no more responses");
      return next();
    }
    if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "test/model", pricing: { prompt: "0.000001" } }] }));
    if (url.includes("/endpoints")) return new Response(JSON.stringify({ data: { endpoints: [] } }));
    if (url.includes("/generation")) {
      // The record lags: the first fetch of each generation is not there yet.
      const n = (generationTries.get(url) ?? 0) + 1;
      generationTries.set(url, n);
      return n === 1
        ? new Response('{"error":{"message":"not found"}}', { status: 404 })
        : new Response(JSON.stringify({ data: { id: url, total_cost: 0.0001, latency: 120 } }));
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetcher, seen };
}

const base = (fetcher: typeof fetch, practice: Practice) => ({
  runId: "t1",
  model: "test/model",
  try: 1,
  challenge: { metadata, revision },
  open: async () => practice,
  fetch: fetcher,
  apiKey: "sk-test",
  retry: { attempts: 3, backoffMs: 0 },
  generationWaitsMs: [0, 0],
  sleep: async () => undefined,
});

const decode = (records: readonly StoredRecord[]) =>
  records.filter((r) => r.kind === "observation").map((r) => JSON.parse(r.payload));

test("a run that writes and submits: lines raw, reasoning passed back, accounting fetched", async () => {
  const practice = fakePractice();
  const solution = "def fixture(value):\n    return value\n";
  const { fetcher, seen } = fakeFetch([
    () =>
      streamed(
        sse(
          ": OPENROUTER PROCESSING",
          "",
          { id: "gen-1", model: "test/model", choices: [{ index: 0, delta: { reasoning: "Split ", reasoning_details: [{ type: "reasoning.text", index: 0, text: "Split ", format: "x" }] } }] },
          { id: "gen-1", choices: [{ index: 0, delta: { reasoning: "on spaces.", reasoning_details: [{ type: "reasoning.text", index: 0, text: "on spaces.", signature: "sig" }] } }] },
          call("call-1", "write_code", JSON.stringify({ text: solution }).slice(0, 10)),
          { id: "gen-1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ text: solution }).slice(10) } }] } }] },
          usage("1", "tool_calls"),
          "data: [DONE]",
        ),
        200,
        { "x-generation-id": "gen-1" },
      ),
    () => streamed(sse(call("call-2", "submit", "{}"), usage("2", "tool_calls"), "data: [DONE]")),
  ]);
  const result = await runModel(base(fetcher, practice));
  assert.equal(result.outcome, "completed");
  assert.equal(result.turns, 2);
  assert.equal(result.submissions, 1);
  assert.deepEqual(practice.calls, ["write", "submit"]);

  const observations = decode(result.records);
  assert.ok(observations.every((o) => o.actor === "model" && o.termsVersion === null));
  assert.deepEqual(
    observations.map((o) => o.source.sequence),
    observations.map((_, i) => i + 1),
  );
  const types = observations.map((o) => o.type);
  assert.deepEqual(types.slice(0, 2), ["model.run-started", "model.catalog"]);
  assert.ok(types.indexOf("model.ended") < types.indexOf("model.generation"));
  assert.equal(types.at(-1), "model.catalog");

  // Every line kept as it arrived, the keep-alive comment and blank line included.
  const lines = observations
    .filter((o) => o.type === "model.chunks" && o.data.turn === 1)
    .flatMap((o) => o.data.lines.map((l: [number, string]) => l[1]));
  assert.equal(lines[0], ": OPENROUTER PROCESSING");
  assert.equal(lines[1], "");
  assert.equal(lines.at(-1), "data: [DONE]");

  const first = observations.find((o) => o.type === "model.response" && o.data.turn === 1).data;
  assert.equal(first.generationId, "gen-1");
  assert.equal(first.finishReason, "tool_calls");
  assert.deepEqual(first.usage, { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 });
  assert.ok(first.timing.firstReasoningMs <= first.timing.firstToolCallMs);

  // The second request carries the reasoning back verbatim, merged, and the tool's result.
  const second = JSON.parse(seen.filter((s) => s.url.endsWith("/chat/completions"))[1].body!);
  assert.deepEqual(second.messages[2].reasoning_details, [
    { type: "reasoning.text", index: 0, text: "Split on spaces.", format: "x", signature: "sig" },
  ]);
  assert.equal(second.messages[2].tool_calls[0].function.arguments, JSON.stringify({ text: solution }));
  assert.equal(second.messages[3].role, "tool");
  assert.match(second.messages[3].content, /Edited fixture\.py/);
  assert.equal(second.stream, true);
  // The key is sent, never recorded.
  assert.equal(seen[2].headers.authorization, "Bearer sk-test");
  assert.ok(!result.records.some((r) => r.payload.includes("sk-test")));

  const toolResults = observations.filter((o) => o.type === "model.tool-result").map((o) => o.data);
  assert.deepEqual(toolResults[0].practice, { from: 3, to: 3 });
  assert.match(toolResults[1].content, /^Done\./);

  // Each generation fetched until it is there: 404, then 200.
  const generations = observations.filter((o) => o.type === "model.generation").map((o) => [o.data.generationId, o.data.fetch, o.data.exchange.status]);
  assert.deepEqual(generations, [["gen-1", 1, 404], ["gen-1", 2, 200], ["gen-call-2", 1, 404], ["gen-call-2", 2, 200]]);

  // The model's own entry, at the start and the end; never the whole list.
  const blobs = result.records.filter((r) => r.kind === "artifact");
  const catalogs = observations.filter((o) => o.type === "model.catalog").map((o) => o.data.listing);
  assert.deepEqual(catalogs.map((l) => [l.body, l.entry]), [0, 1].map(() => [null, { id: "test/model", pricing: { prompt: "0.000001" } }]));
  // Request bodies are blobs too, cited by id.
  const request = observations.find((o) => o.type === "model.request").data;
  assert.ok(blobs.some((b) => b.recordId === request.bodyArtifactId));
  assert.equal(request.headers.authorization, undefined);
});

test("transient failures are retried and recorded; a failing stream ends the run as an error", async () => {
  const practice = fakePractice();
  const failing = () =>
    streamed(sse({ id: "gen-x", error: { code: 502, message: "upstream" }, choices: [{ index: 0, delta: {}, finish_reason: "error" }] }));
  const { fetcher } = fakeFetch([
    () => new Response('{"error":{"code":429}}', { status: 429 }),
    failing,
    failing,
  ]);
  const result = await runModel(base(fetcher, practice));
  assert.equal(result.outcome, "error");
  const errors = decode(result.records)
    .filter((o) => o.type === "model.http-error")
    .map((o) => [o.data.attempt, o.data.kind, o.data.status, o.data.retrying]);
  assert.deepEqual(errors, [
    [1, "status", 429, true],
    [2, "stream", 200, true],
    [3, "stream", 200, false],
  ]);
  assert.deepEqual(practice.calls, []);
});

test("a bad tool call is answered and recorded; a reply without one ends the run", async () => {
  const practice = fakePractice();
  const { fetcher } = fakeFetch([
    () => streamed(sse(call("c1", "write_code", '{"text": "unterminated'), usage("1", "tool_calls"), "data: [DONE]")),
    () => streamed(sse(call("c2", "rm_rf", "{}"), usage("2", "tool_calls"), "data: [DONE]")),
    () => streamed(sse({ id: "gen-3", choices: [{ index: 0, delta: { content: "I give up." } }] }, usage("3", "stop"), "data: [DONE]")),
  ]);
  const result = await runModel(base(fetcher, practice));
  assert.equal(result.outcome, "stopped");
  assert.equal(result.reason, "stop");
  const observations = decode(result.records);
  assert.deepEqual(
    observations.filter((o) => o.type === "model.tool-call").map((o) => [o.data.name, o.data.parse, o.data.arguments]),
    [["write_code", "invalid-json", '{"text": "unterminated'], ["rm_rf", "unknown-tool", "{}"]],
  );
  assert.deepEqual(
    observations.filter((o) => o.type === "model.tool-result").map((o) => o.data.practice),
    [null, null],
  );
  assert.equal(observations.find((o) => o.type === "model.response" && o.data.turn === 3).data.message.content, "I give up.");
  assert.deepEqual(practice.calls, []);
});

test("the submission budget ends a run that never completes", async () => {
  const practice = fakePractice();
  const { fetcher } = fakeFetch([
    () => streamed(sse(call("c1", "submit", ""), usage("1", "tool_calls"), "data: [DONE]")),
    () => streamed(sse(call("c2", "submit", "{}"), usage("2", "tool_calls"), "data: [DONE]")),
  ]);
  const result = await runModel({ ...base(fetcher, practice), budget: { turns: 50, submissions: 2 } });
  assert.deepEqual([result.outcome, result.reason, result.submissions], ["budget", "2 submissions", 2]);
});

test("tool arguments must be exactly what the tool takes", () => {
  assert.equal(parseCall("submit", "").parse, "ok");
  assert.equal(parseCall("submit", '{"why":1}').parse, "invalid-arguments");
  assert.equal(parseCall("edit_code", '{"old":"a"}').parse, "invalid-arguments");
  assert.deepEqual(parseCall("edit_code", '{"old":"a","new":"b"}'), { parse: "ok", name: "edit_code", old: "a", new: "b" });
  assert.equal(parseCall("write_code", "[1]").parse, "invalid-arguments");
});

test("arguments a provider streamed twice are one call; other invalid arguments stay invalid", () => {
  const twice = assembled();
  const delta = (args: string) =>
    `data: ${JSON.stringify({ id: "g", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] })}`;
  addLine(twice, `data: ${JSON.stringify(call("c", "edit_code", ""))}`, 1);
  addLine(twice, delta('{"old":"x","new":"y"}'), 2);
  addLine(twice, delta('{"old":"x","new":"y"}'), 3);
  assert.deepEqual(settle(twice).toolCalls[0].function.arguments, '{"old":"x","new":"y"}');
  assert.equal(twice.toolCalls[0].repeated, true);
  const broken = assembled();
  addLine(broken, `data: ${JSON.stringify(call("c", "edit_code", '{"old":"x"}{"old":"y"}'))}`, 1);
  assert.equal(settle(broken).toolCalls[0].function.arguments, '{"old":"x"}{"old":"y"}');
  assert.equal(broken.toolCalls[0].repeated, undefined);
});

test("a usage chunk repeating the finish reason is accounting, not a second message", () => {
  const a = assembled();
  addLine(a, `data: ${JSON.stringify({ id: "g", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: "stop" }] })}`, 1);
  addLine(a, `data: ${JSON.stringify(usage("g", "stop"))}`, 2);
  assert.equal(addLine(a, "data: [DONE]", 3), false);
  assert.deepEqual([a.content, a.finishReason, a.firstContentMs, a.lastLineMs], ["Hi", "stop", 1, 3]);
  assert.ok(a.usage);
});
