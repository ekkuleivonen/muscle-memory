/**
 * OpenRouter's chat completions, streamed and kept raw: every line exactly as it arrived with
 * its time, and what the lines add up to (the assistant message, finish reasons, usage, an
 * error the stream carried). Parsing never drops a line it does not understand: the lines are
 * the record; the assembled message is only what the harness acts on.
 */
import type { Json } from "../domain/json";
import type { ChunkLine, HttpExchange } from "../domain/model";

export const OPENROUTER = "https://openrouter.ai/api/v1";

export interface ToolCall {
  index: number;
  id: string;
  type: string;
  function: { name: string; arguments: string };
  /** The stream sent the whole arguments twice; `arguments` is one copy (see `settle`). */
  repeated?: boolean;
}

/** What a streamed response adds up to. */
export interface Assembled {
  generationId: string | null;
  model: string | null;
  provider: string | null;
  content: string;
  reasoning: string;
  /** Merged by index, passed back unchanged on the next turn as the provider requires. */
  reasoningDetails: Record<string, Json>[];
  refusal: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  nativeFinishReason: string | null;
  usage: Json | null;
  error: Json | null;
  /** Stream-clock times of the first line and of the first of each kind of delta. */
  firstLineMs: number | null;
  firstReasoningMs: number | null;
  firstContentMs: number | null;
  firstToolCallMs: number | null;
  lastLineMs: number | null;
}

export function assembled(): Assembled {
  return {
    generationId: null,
    model: null,
    provider: null,
    content: "",
    reasoning: "",
    reasoningDetails: [],
    refusal: null,
    toolCalls: [],
    finishReason: null,
    nativeFinishReason: null,
    usage: null,
    error: null,
    firstLineMs: null,
    firstReasoningMs: null,
    firstContentMs: null,
    firstToolCallMs: null,
    lastLineMs: null,
  };
}

/** Text fields of a reasoning detail that stream in pieces. */
const STREAMED = new Set(["text", "summary", "data"]);

/** Adds one received line to what the stream adds up to. Returns false at `[DONE]`. */
export function addLine(into: Assembled, line: string, at: number): boolean {
  into.firstLineMs ??= at;
  into.lastLineMs = at;
  if (!line.startsWith("data:")) return true; // Comments (": OPENROUTER PROCESSING") and blanks.
  const data = line.slice(5).trim();
  if (data === "[DONE]") return false;
  let chunk: any;
  try {
    chunk = JSON.parse(data);
  } catch {
    return true; // Kept as a line; nothing to add.
  }
  if (typeof chunk?.id === "string") into.generationId ??= chunk.id;
  if (typeof chunk?.model === "string") into.model = chunk.model;
  if (typeof chunk?.provider === "string") into.provider = chunk.provider;
  if (chunk?.usage !== undefined) into.usage = chunk.usage;
  if (chunk?.error !== undefined) into.error = chunk.error;
  for (const choice of Array.isArray(chunk?.choices) ? chunk.choices : []) {
    const delta = choice?.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      into.content += delta.content;
      into.firstContentMs ??= at;
    }
    const reasoning = delta.reasoning ?? delta.reasoning_content;
    if (typeof reasoning === "string" && reasoning) {
      into.reasoning += reasoning;
      into.firstReasoningMs ??= at;
    }
    if (typeof delta.refusal === "string") into.refusal = (into.refusal ?? "") + delta.refusal;
    for (const detail of Array.isArray(delta.reasoning_details) ? delta.reasoning_details : []) {
      into.firstReasoningMs ??= at;
      const index = typeof detail?.index === "number" ? detail.index : into.reasoningDetails.length;
      const merged = (into.reasoningDetails[index] ??= {});
      for (const [key, value] of Object.entries(detail ?? {}))
        merged[key] =
          STREAMED.has(key) && typeof value === "string" && typeof merged[key] === "string"
            ? (merged[key] as string) + value
            : (value as Json);
    }
    for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
      into.firstToolCallMs ??= at;
      const index = typeof call?.index === "number" ? call.index : into.toolCalls.length;
      const merged = (into.toolCalls[index] ??= {
        index,
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      });
      if (typeof call.id === "string" && call.id) merged.id = call.id;
      if (typeof call.type === "string") merged.type = call.type;
      if (typeof call.function?.name === "string") merged.function.name += call.function.name;
      if (typeof call.function?.arguments === "string")
        merged.function.arguments += call.function.arguments;
    }
    if (choice?.finish_reason) into.finishReason = choice.finish_reason;
    if (choice?.native_finish_reason) into.nativeFinishReason = choice.native_finish_reason;
  }
  return true;
}

/**
 * Undoes a provider's repetition: some send a tool call's complete arguments as a delta and
 * then again, so concatenating deltas, as the protocol says, gives `{…}{…}`. When the
 * arguments are exactly one valid JSON value twice over, the call keeps one copy and says so.
 * The model wrote a valid call; the lines record what the provider sent. Anything else is left
 * exactly as assembled, invalid or not.
 */
export function settle(a: Assembled): Assembled {
  for (const call of a.toolCalls) {
    const text = call?.function.arguments ?? "";
    const half = text.slice(0, text.length / 2);
    if (text.length % 2 || !half || half + half !== text) continue;
    try {
      JSON.parse(half);
    } catch {
      continue;
    }
    call.function.arguments = half;
    call.repeated = true;
  }
  return a;
}

/** The assistant message to send back next turn: what the model said, as it said it. */
export function assistantMessage(a: Assembled): Record<string, Json> {
  return {
    role: "assistant",
    content: a.content,
    ...(a.reasoningDetails.length
      ? { reasoning_details: a.reasoningDetails.filter(Boolean) }
      : a.reasoning
        ? { reasoning: a.reasoning }
        : {}),
    ...(a.toolCalls.length
      ? {
          tool_calls: a.toolCalls.filter(Boolean).map((c) => ({
            id: c.id,
            type: c.type,
            function: { name: c.function.name, arguments: c.function.arguments },
          })),
        }
      : {}),
  };
}

/** Headers as a plain record, in the order received. */
export function headersOf(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => (out[key] = value));
  return out;
}

export interface StreamHooks {
  /** The stream clock now. */
  now(): number;
  onHeaders(status: number, headers: Record<string, string>): void;
  onLine(line: ChunkLine): void;
}

export type StreamResult =
  | { kind: "streamed"; status: number; assembled: Assembled }
  | { kind: "status"; status: number; body: string }
  | { kind: "network"; message: string }
  | { kind: "timeout"; message: string };

/**
 * Sends one streaming request and reads it to the end, handing every line to `onLine` as it
 * arrives. A status other than 200 is read whole and returned; so is a failure to connect.
 */
export async function stream(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: string,
  hooks: StreamHooks,
  timeoutMs: number,
): Promise<StreamResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { method: "POST", headers, body, signal: controller.signal });
    hooks.onHeaders(response.status, headersOf(response.headers));
    if (response.status !== 200 || !response.body)
      return { kind: "status", status: response.status, body: await response.text() };
    const result = assembled();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    for (;;) {
      const { done, value } = await reader.read();
      const at = hooks.now();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = done ? "" : lines.pop()!;
      for (const line of done && lines.at(-1) === "" ? lines.slice(0, -1) : lines) {
        hooks.onLine([at, line]);
        addLine(result, line, at);
      }
      if (done) break;
    }
    return { kind: "streamed", status: response.status, assembled: settle(result) };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    return controller.signal.aborted ? { kind: "timeout", message } : { kind: "network", message };
  } finally {
    clearTimeout(timer);
  }
}

/** A GET, recorded whole. */
export async function exchange(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
  now: () => number,
): Promise<HttpExchange> {
  const start = now();
  try {
    const response = await fetcher(url, { headers });
    const body = await response.text();
    return {
      url,
      status: response.status,
      headers: headersOf(response.headers),
      body,
      error: null,
      durationMs: Math.round((now() - start) * 10) / 10,
    };
  } catch (error) {
    return {
      url,
      status: null,
      headers: {},
      body: null,
      error: String((error as Error)?.message ?? error),
      durationMs: Math.round((now() - start) * 10) / 10,
    };
  }
}
