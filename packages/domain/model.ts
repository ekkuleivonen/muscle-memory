/**
 * The model stream (docs/model-runs.md): everything that crossed the boundary between the
 * offline harness and a model, raw. Every request exactly as sent, every line of every streamed
 * response exactly as received with its arrival time, what the harness parsed and acted on,
 * the provider's own accounting of each generation, the model's listing and prices when the
 * run started and ended, and every tool call with the practice observations it caused.
 *
 * A model run records two streams in one session on one clock: its practice stream (the same
 * types as a person's, packages/domain/practice.ts, with `actor: "model"`) and this one. A tool
 * call names the range of practice positions it caused, which is how a model's actions line
 * up with a person's. Interpretation (tokens per solve, thinking time, edit style) is derived
 * later from these and versioned there.
 */
import { safeIdentifier } from "./capture";
import { canonical, type Json } from "./json";
import { envelope, type Envelope, type EnvelopeInput, type StoredRecord } from "./records";

/** 1.0: the first model stream. */
export const MODEL_CAPTURE_VERSION = "model-capture-1.0.0";
/** What this capture does not record. Absence is a gap, not evidence of no activity. */
export const MODEL_CAPTURE_GAPS = [
  // Bytes arrive as lines; how the network split them below a line is not kept.
  "network-reads-within-a-line",
  // The authorization header is never stored.
  "request-credentials",
] as const;

/** A streamed line as it arrived: when (the stream's clock) and its exact text. */
export type ChunkLine = readonly [elapsedMs: number, line: string];

/** Positions in the run's practice stream, inclusive; null when a call caused none. */
export type PracticeRange = { readonly from: number; readonly to: number } | null;

export type ToolParse = "ok" | "invalid-json" | "invalid-arguments" | "unknown-tool";

export type RunOutcome =
  /** A submission completed the attempt. */
  | "completed"
  /** The model replied without a tool call: it stopped, as a person leaves. */
  | "stopped"
  /** The run reached its turn or submission budget. */
  | "budget"
  /** The model or its provider refused, or stopped on a content filter. */
  | "refused"
  /** The model or provider failed, beyond what the harness retries. */
  | "error";

export interface ModelData {
  /**
   * The run began: what it is and the exact configuration every request uses. `request` is
   * the body's fixed part (model, parameters); messages are in each `model.request`.
   */
  "model.run-started": {
    readonly runId: string;
    /** The model asked for, as OpenRouter names it, such as anthropic/claude-opus-5-5. */
    readonly model: string;
    readonly harnessVersion: string;
    /** 1, 2, 3, … per revision, model, harness version and condition. */
    readonly try: number;
    readonly endpoint: string;
    readonly systemPrompt: string;
    readonly tools: Json;
    readonly request: Json;
    readonly budget: { readonly turns: number; readonly submissions: number };
    /** Where it ran: harness commit, Node, browser and platform. */
    readonly environment: Json;
    readonly captureGaps: readonly string[];
  };
  /**
   * The model's listing when the run started and ended, verbatim: its entry in OpenRouter's
   * model list (prices, context, parameters) and its endpoints (per-provider prices, latency,
   * throughput, uptime). Prices change; these are the prices then.
   */
  "model.catalog": {
    readonly at: "start" | "end";
    readonly listing: HttpExchange;
    readonly endpoints: HttpExchange;
  };
  /** A request as sent: its body is an artifact (bodies grow every turn). */
  "model.request": {
    readonly turn: number;
    /** 1, then 2, 3, … when the harness retries the same turn. */
    readonly attempt: number;
    readonly method: "POST";
    readonly url: string;
    /** Every header sent but authorization. */
    readonly headers: Readonly<Record<string, string>>;
    readonly bodyArtifactId: string;
    readonly bodyBytes: number;
  };
  /** The response's status and headers as they arrived. */
  "model.response-started": {
    readonly turn: number;
    readonly attempt: number;
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
  };
  /** Streamed lines exactly as received, comments and blank lines included, about a second at a time. */
  "model.chunks": {
    readonly turn: number;
    readonly attempt: number;
    readonly lines: readonly ChunkLine[];
  };
  /**
   * What the harness read from a finished response and acted on: the assembled message
   * (content, reasoning, reasoning_details, tool calls) and the accounting the stream ended
   * with. Times are the stream clock at each first sight.
   */
  "model.response": {
    readonly turn: number;
    readonly attempt: number;
    readonly generationId: string | null;
    /** The model and provider the response names, as it names them. */
    readonly model: string | null;
    readonly provider: string | null;
    readonly message: Json;
    readonly finishReason: string | null;
    readonly nativeFinishReason: string | null;
    readonly usage: Json | null;
    /** An error the stream itself carried (HTTP 200 with an error chunk). */
    readonly error: Json | null;
    readonly timing: {
      readonly sentMs: number;
      readonly headersMs: number | null;
      readonly firstLineMs: number | null;
      readonly firstReasoningMs: number | null;
      readonly firstContentMs: number | null;
      readonly firstToolCallMs: number | null;
      readonly lastLineMs: number | null;
    };
  };
  /** A request that failed: before streaming (status and body), mid-stream, or on the network. */
  "model.http-error": {
    readonly turn: number;
    readonly attempt: number;
    readonly kind: "status" | "stream" | "network" | "timeout";
    readonly status: number | null;
    readonly body: string | null;
    readonly message: string | null;
    /** Whether the harness tries this turn again. */
    readonly retrying: boolean;
  };
  /** The provider's own record of a generation (OpenRouter's /generation), verbatim, each fetch. */
  "model.generation": {
    readonly turn: number;
    readonly generationId: string;
    /** 1, 2, 3, …: the record can lag the response. */
    readonly fetch: number;
    readonly exchange: HttpExchange;
  };
  /** A tool call as the model wrote it, and whether the harness could act on it. */
  "model.tool-call": {
    readonly turn: number;
    readonly callId: string;
    readonly name: string;
    /** The arguments exactly as written, valid JSON or not. */
    readonly arguments: string;
    readonly parse: ToolParse;
  };
  /** What the tool did and the exact text the model was given back. */
  "model.tool-result": {
    readonly turn: number;
    readonly callId: string;
    readonly content: string;
    readonly durationMs: number;
    readonly practice: PracticeRange;
  };
  "model.ended": {
    readonly outcome: RunOutcome;
    readonly reason: string | null;
    readonly turns: number;
    readonly submissions: number;
  };
  "model.capture-gap": {
    readonly fromSequence: number;
    readonly toSequence: number;
    readonly reason: string;
  };
}

/** One HTTP request and its response as received. */
export interface HttpExchange {
  readonly url: string;
  /** Null when no response came. */
  readonly status: number | null;
  readonly headers: Readonly<Record<string, string>>;
  /** The body exactly as received; null when there was none, or when it is stored as a blob. */
  readonly body: string | null;
  /** A large body stored once under its hash (`artifact.blob`), such as the full model list. */
  readonly bodyArtifactId?: string;
  readonly error: string | null;
  readonly durationMs: number;
}

export type ModelType = keyof ModelData;
export type ModelObservation<T extends ModelType = ModelType> = Envelope<T, ModelData[T]>;

/** A model's observation; the envelope's actor is always a model, with no Terms. */
export function modelObservation<T extends ModelType>(
  type: T,
  input: Omit<EnvelopeInput, "actor" | "termsVersion">,
  data: ModelData[T],
): ModelObservation<T> {
  return envelope(type, MODEL_CAPTURE_VERSION, { ...input, actor: "model", termsVersion: null }, data);
}

/**
 * Text stored once under its hash and cited by id: request bodies, which repeat every earlier
 * message, and anything else too large to repeat. Unbounded: model runs are not uploaded from
 * a browser, and their raw exchanges are the point.
 */
export interface BlobArtifact {
  readonly schemaVersion: "1.0.0";
  readonly type: "artifact.blob";
  /** `blob.sha256-<hex>` of the text's UTF-8. */
  readonly artifactId: string;
  readonly participantId: string;
  readonly captureVersion: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly text: string;
}

export function blobArtifact(
  participantId: string,
  mediaType: string,
  text: string,
  sha256Hex: string,
): BlobArtifact {
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error("A blob is named by its SHA-256.");
  const artifactId = `blob.sha256-${sha256Hex}`;
  safeIdentifier(artifactId);
  return {
    schemaVersion: "1.0.0",
    type: "artifact.blob",
    artifactId,
    participantId,
    captureVersion: MODEL_CAPTURE_VERSION,
    mediaType,
    bytes: new TextEncoder().encode(text).length,
    text,
  };
}

export function blobRecord(blob: BlobArtifact): StoredRecord {
  return {
    recordId: blob.artifactId,
    kind: "artifact",
    participantId: blob.participantId,
    payload: canonical(blob as unknown as Json),
  };
}

/**
 * A model's participant id: `model:` and the model's name with anything an id cannot hold
 * replaced, so a model's runs join like one person's sessions.
 */
export function modelParticipant(model: string): string {
  const id = `model:${model.replace(/[^a-zA-Z0-9._:-]/g, "_")}`.slice(0, 128);
  safeIdentifier(id);
  return id;
}
