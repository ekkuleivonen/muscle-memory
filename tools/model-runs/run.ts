/**
 * One model run: one model, one challenge revision, one try. A manual tool-use loop over
 * OpenRouter's streaming chat completions, driving headless practice, with everything recorded
 * raw in two streams on one clock (docs/model-runs.md). The harness never nudges: a reply
 * without a tool call ends the run. Provider failures are retried and recorded; a model's own
 * failure (a refusal, a bad tool call, giving up) is a result and never retried.
 */
import type { ChallengeMetadata, Revision } from "../../packages/content/model";
import type { Json } from "../../packages/domain/json";
import {
  MODEL_CAPTURE_GAPS,
  modelParticipant,
  type HttpExchange,
  type RunOutcome,
} from "../../packages/domain/model";
import {
  MODEL_PRACTICE_CAPTURE_GAPS,
  PRACTICE_CAPTURE_GAPS,
} from "../../packages/domain/practice";
import type { Assignments, StoredRecord } from "../../packages/domain/records";
import { checksTypes, TYPE_CHECK_FEATURES } from "../../apps/web/app/practice/type-checker";
import { ModelRecorder } from "./model-recorder";
import { assistantMessage, exchange, OPENROUTER, stream } from "./openrouter";
import type { Edited, Opened, OpenConfig, Ran, Range } from "./page";
import { runClock } from "./practice";
import { edited, opening, ran } from "./render";
import { HARNESS_VERSION, parseCall, SYSTEM_PROMPT, TOOLS } from "./tools";

/** What the loop needs of practice: ./practice.ts in a browser, or a stand-in in tests. */
export interface Practice {
  readonly opened: Opened;
  readonly records: readonly StoredRecord[];
  edit(old: string, replacement: string): Promise<Edited>;
  write(text: string): Promise<Edited>;
  run(purpose: "examples" | "submit"): Promise<Ran>;
  close(): Promise<Range>;
}

export interface Budget {
  /** Model calls (turns), retries not counted. */
  readonly turns: number;
  readonly submissions: number;
}

export const DEFAULT_BUDGET: Budget = { turns: 50, submissions: 10 };

export interface RunInput {
  readonly runId: string;
  /** As OpenRouter names it, such as anthropic/claude-opus-5-5. */
  readonly model: string;
  readonly try: number;
  readonly challenge: { readonly metadata: ChallengeMetadata; readonly revision: Revision };
  readonly open: (config: OpenConfig) => Promise<Practice>;
  readonly fetch: typeof fetch;
  readonly apiKey: string;
  /** Fixed request parameters besides model, messages, tools and stream (reasoning, …). */
  readonly request?: Readonly<Record<string, Json>>;
  readonly budget?: Budget;
  readonly assignments?: Assignments;
  /** Where it ran, recorded with the run. */
  readonly environment?: Json;
  readonly endpoint?: string;
  /** Per request; a stream that has not finished by then is a timeout. */
  readonly timeoutMs?: number;
  /** Transient provider failures: how many tries per turn, and the first wait. */
  readonly retry?: { readonly attempts: number; readonly backoffMs: number };
  /** Waits before fetching each generation's record again (it can lag). */
  readonly generationWaitsMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RunResult {
  readonly outcome: RunOutcome;
  readonly reason: string | null;
  readonly turns: number;
  readonly submissions: number;
  /** Both streams' records: practice first, then the model stream with its blobs. */
  readonly records: StoredRecord[];
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529]);

export async function runModel(input: RunInput): Promise<RunResult> {
  const endpoint = input.endpoint ?? OPENROUTER;
  const budget = input.budget ?? DEFAULT_BUDGET;
  const retry = input.retry ?? { attempts: 3, backoffMs: 2000 };
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const { metadata, revision } = input.challenge;
  const participantId = modelParticipant(input.model);
  const origin = runClock();
  const ids = {
    sessionId: `run-${input.runId}`,
    attemptId: `attempt-${input.runId}`,
  };
  const recorder = new ModelRecorder({
    participantId,
    sessionId: ids.sessionId,
    sourceId: `model-${input.runId}`,
    challenge: { key: metadata.key, revision: metadata.revision },
    attemptId: ids.attemptId,
    assignments: input.assignments,
    clock: runClock,
    origin,
  });
  const fixed: Record<string, Json> = { ...(input.request ?? {}), model: input.model, stream: true };
  recorder.observe("model.run-started", {
    runId: input.runId,
    model: input.model,
    harnessVersion: HARNESS_VERSION,
    try: input.try,
    endpoint,
    systemPrompt: SYSTEM_PROMPT,
    tools: TOOLS,
    request: fixed,
    budget,
    environment: input.environment ?? null,
    captureGaps: MODEL_CAPTURE_GAPS,
  });
  const auth = { authorization: `Bearer ${input.apiKey}` };
  const sent = {
    "content-type": "application/json",
    "http-referer": "https://musclememory.run",
    "x-title": "Muscle Memory model runs",
  };
  await catalog("start");

  const practice = await input.open({
    key: metadata.key,
    revisionId: metadata.revision,
    revision,
    participantId,
    sessionId: ids.sessionId,
    sourceId: `practice-${input.runId}`,
    attemptId: ids.attemptId,
    origin,
    editor: {
      name: HARNESS_VERSION,
      features: [
        "whole-file-view",
        ...TOOL_FEATURES,
        // Squiggles, as text after every edit; hover types are not offered.
        ...(checksTypes(revision.language) ? [TYPE_CHECK_FEATURES[0]] : []),
      ],
    },
    captureGaps: [...PRACTICE_CAPTURE_GAPS, ...MODEL_PRACTICE_CAPTURE_GAPS],
  });
  const { runtimeLabel, typeChecked } = practice.opened;
  const messages: Json[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: opening(metadata, revision, runtimeLabel, typeChecked) },
  ];
  const generations: { turn: number; id: string }[] = [];
  let turn = 0;
  let submissions = 0;
  let end: { outcome: RunOutcome; reason: string | null } | null = null;

  while (!end) {
    if (turn >= budget.turns) {
      end = { outcome: "budget", reason: `${budget.turns} turns` };
      break;
    }
    turn++;
    const response = await request(turn);
    if ("failed" in response) {
      end = { outcome: "error", reason: response.failed };
      break;
    }
    const a = response.assembled;
    if (a.generationId) generations.push({ turn, id: a.generationId });
    messages.push(assistantMessage(a));
    const calls = a.toolCalls.filter(Boolean);
    if (!calls.length) {
      end =
        a.finishReason === "content_filter" || a.refusal
          ? { outcome: "refused", reason: a.refusal ?? a.finishReason }
          : { outcome: "stopped", reason: a.finishReason };
      break;
    }
    for (const call of calls) {
      const parsed = parseCall(call.function.name, call.function.arguments);
      recorder.observe("model.tool-call", {
        turn,
        callId: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        parse: parsed.parse,
      });
      const started = runClock();
      let content: string;
      let range: Range = null;
      let completed = false;
      if (parsed.parse !== "ok") content = `Error: ${parsed.message}`;
      else if (parsed.name === "edit_code" || parsed.name === "write_code") {
        const result =
          parsed.name === "edit_code"
            ? await practice.edit(parsed.old, parsed.new)
            : await practice.write(parsed.text);
        range = result.practice;
        content = edited(
          result,
          revision.file,
          result.applied
            ? null
            : `No change: \`old\` must occur exactly once in ${revision.file}; it occurs ${occurrences(result.code, parsed.name === "edit_code" ? parsed.old : "")} times.`,
        );
      } else {
        const result = await practice.run(parsed.name === "submit" ? "submit" : "examples");
        range = result.practice;
        content = ran(result, revision, runtimeLabel);
        if (parsed.name === "submit") {
          submissions++;
          completed = result.completed;
        }
      }
      recorder.observe("model.tool-result", {
        turn,
        callId: call.id,
        content,
        durationMs: Math.round((runClock() - started) * 10) / 10,
        practice: range,
      });
      messages.push({ role: "tool", tool_call_id: call.id, content });
      if (completed) end = { outcome: "completed", reason: null };
      else if (parsed.parse === "ok" && parsed.name === "submit" && submissions >= budget.submissions)
        end = { outcome: "budget", reason: `${budget.submissions} submissions` };
      if (end) break;
    }
  }

  await practice.close();
  recorder.observe("model.ended", { ...end, turns: turn, submissions });
  for (const generation of generations) await fetchGeneration(generation);
  await catalog("end");
  recorder.writeLines();
  return { ...end, turns: turn, submissions, records: [...practice.records, ...recorder.records] };

  /** One turn's request, retried on transient provider failures. */
  async function request(
    turn: number,
  ): Promise<{ assembled: import("./openrouter").Assembled } | { failed: string }> {
    const body = JSON.stringify({ ...fixed, messages, tools: TOOLS });
    const stored = recorder.blob(body, "application/json");
    for (let attempt = 1; ; attempt++) {
      const sentMs = recorder.elapsed();
      recorder.observe("model.request", {
        turn,
        attempt,
        method: "POST",
        url: `${endpoint}/chat/completions`,
        headers: sent,
        bodyArtifactId: stored.artifactId,
        bodyBytes: stored.bytes,
      });
      let headersMs: number | null = null;
      const result = await stream(
        input.fetch,
        `${endpoint}/chat/completions`,
        { ...sent, ...auth },
        body,
        {
          now: () => recorder.elapsed(),
          onHeaders: (status, headers) => {
            headersMs = recorder.elapsed();
            recorder.observe("model.response-started", { turn, attempt, status, headers });
          },
          onLine: (line) => recorder.line(turn, attempt, line),
        },
        input.timeoutMs ?? 600_000,
      );
      recorder.writeLines();
      const more = attempt < retry.attempts;
      if (result.kind === "streamed") {
        const a = result.assembled;
        recorder.observe("model.response", {
          turn,
          attempt,
          generationId: a.generationId,
          model: a.model,
          provider: a.provider,
          message: assistantMessage(a),
          finishReason: a.finishReason,
          nativeFinishReason: a.nativeFinishReason,
          usage: a.usage,
          error: a.error,
          timing: {
            sentMs,
            headersMs,
            firstLineMs: a.firstLineMs,
            firstReasoningMs: a.firstReasoningMs,
            firstContentMs: a.firstContentMs,
            firstToolCallMs: a.firstToolCallMs,
            lastLineMs: a.lastLineMs,
          },
        });
        if (a.error === null && a.finishReason !== "error") return { assembled: a };
        recorder.observe("model.http-error", {
          turn,
          attempt,
          kind: "stream",
          status: result.status,
          body: null,
          message: JSON.stringify(a.error),
          retrying: more,
        });
        if (a.generationId) generations.push({ turn, id: a.generationId });
        if (!more) return { failed: `the stream failed: ${JSON.stringify(a.error)}` };
      } else {
        const retryable = result.kind !== "status" || RETRYABLE.has(result.status);
        recorder.observe("model.http-error", {
          turn,
          attempt,
          kind: result.kind,
          status: result.kind === "status" ? result.status : null,
          body: result.kind === "status" ? result.body : null,
          message: result.kind === "status" ? null : result.message,
          retrying: retryable && more,
        });
        if (!retryable || !more)
          return {
            failed:
              result.kind === "status"
                ? `HTTP ${result.status}: ${result.body.slice(0, 500)}`
                : `${result.kind}: ${result.message}`,
          };
      }
      await sleep(retry.backoffMs * 2 ** (attempt - 1));
    }
  }

  /** OpenRouter's record of one generation, fetched until it is there. */
  async function fetchGeneration({ turn, id }: { turn: number; id: string }): Promise<void> {
    const waits = input.generationWaitsMs ?? [1000, 2000, 4000, 8000];
    for (let fetch = 1; ; fetch++) {
      const result = await exchange(
        input.fetch,
        `${endpoint}/generation?id=${encodeURIComponent(id)}`,
        auth,
        runClock,
      );
      recorder.observe("model.generation", { turn, generationId: id, fetch, exchange: result });
      if (result.status === 200 || fetch > waits.length) return;
      await sleep(waits[fetch - 1]);
    }
  }

  /** The model's listing and endpoints, as they are now. The full list is stored once by hash. */
  async function catalog(at: "start" | "end"): Promise<void> {
    const listed = await exchange(input.fetch, `${endpoint}/models`, auth, runClock);
    const [slug] = input.model.split(":");
    const endpoints = await exchange(input.fetch, `${endpoint}/models/${slug}/endpoints`, auth, runClock);
    const listing: HttpExchange =
      listed.body === null
        ? listed
        : { ...listed, body: null, bodyArtifactId: recorder.blob(listed.body, "application/json").artifactId };
    recorder.observe("model.catalog", { at, listing, endpoints });
  }
}

/** What practice says its tools give a model. */
const TOOL_FEATURES = ["edit-code-tool", "write-code-tool", "run-examples-tool", "submit-tool"] as const;

function occurrences(text: string, part: string): number {
  if (!part) return 0;
  let count = 0;
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + 1)) count++;
  return count;
}
