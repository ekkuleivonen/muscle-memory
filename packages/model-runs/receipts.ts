/** Allowlisted offline model receipts. Never return model code, messages, errors or artifacts. */
import { canonical, type Json } from "../domain/json";
import { modelParticipant, MODEL_CAPTURE_VERSION } from "../domain/model";
import { PRACTICE_CAPTURE_VERSION } from "../domain/practice";
import { orderSource } from "../domain/source-order";
import { HARNESS_VERSION, SYSTEM_PROMPT, TOOLS } from "./tools";
import { codeLength } from "./comparison";
import { EFFORTS, MODEL_ID } from "./admin";
export const RECEIPT_BYTES = 8 * 1024 * 1024;
export interface ReceiptSlot {
  model: string;
  harness_version: string;
  condition: string;
  try: number;
  status: string;
  outcome: string | null;
  run_id: string | null;
  submissions: number | null;
}
export interface ModelReceipt {
  model: string;
  reportedModels: string[];
  reasoning: string;
  /** From the run-start listing, never inferred from a successful outcome. */
  defaultReasoning: string | null;
  finalCodeLength: number | null;
  harness: string;
  try: number;
  state:
    | "queued"
    | "running"
    | "infrastructure-failed"
    | "missing"
    | "incompatible"
    | "receipt-unavailable"
    | "completed"
    | "stopped"
    | "budget"
    | "refused"
    | "error";
  submissions: number | null;
  runtime: Record<string, string> | null;
  features: string[];
  budget: { turns: number; submissions: number } | null;
}
const integer = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0;
const safeModel = (s: unknown): s is string =>
  typeof s === "string" && /^[a-zA-Z0-9_~][a-zA-Z0-9_~/.:-]{0,159}$/.test(s);
export function emptyReceipt(
  slot: ReceiptSlot,
  state: ModelReceipt["state"],
): ModelReceipt {
  const effort = JSON.parse(slot.condition).reasoning;
  return {
    model: slot.model,
    reportedModels: [],
    reasoning: effort,
    defaultReasoning: effort === "default" ? "default" : null,
    finalCodeLength: null,
    harness: slot.harness_version,
    try: slot.try,
    state,
    submissions: null,
    runtime: null,
    features: [],
    budget: null,
  };
}
export function validReceiptSlot(slot: ReceiptSlot) {
  try {
    const c = JSON.parse(slot.condition);
    return (
      MODEL_ID.test(slot.model) &&
      slot.harness_version === HARNESS_VERSION &&
      integer(slot.try) &&
      slot.try > 0 &&
      EFFORTS.includes(c.reasoning) &&
      Object.keys(c).length === 1 &&
      ["queued", "running", "finished", "harness-failed"].includes(
        slot.status,
      ) &&
      (!slot.run_id || /^[a-zA-Z0-9_-]{1,128}$/.test(slot.run_id))
    );
  } catch {
    return false;
  }
}
/** Validates identity, source coverage, protocol and ledger agreement before projecting. */
export function modelReceipt(
  slot: ReceiptSlot,
  text: string | null,
  key: string,
  revision: string,
): ModelReceipt {
  const base = emptyReceipt(slot, "incompatible");
  if (slot.status === "queued") return { ...base, state: "queued" };
  if (slot.status === "running") return { ...base, state: "running" };
  if (slot.status === "harness-failed")
    return { ...base, state: "infrastructure-failed" };
  if (text === null) return { ...base, state: "missing" };
  try {
    if (new TextEncoder().encode(text).byteLength > RECEIPT_BYTES)
      throw new Error();
    const unique = new Map<string, string>();
    const observations: any[] = [];
    const artifacts = new Map<string, any>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (row.kind !== "observation") {
        if (row.kind === "artifact") {
          const artifact = JSON.parse(row.payload);
          if (artifact.type === "artifact.code-revision") {
            const prior = artifacts.get(artifact.artifactId);
            if (prior && canonical(prior) !== canonical(artifact))
              throw new Error();
            artifacts.set(artifact.artifactId, artifact);
          }
        }
        continue;
      }
      if (typeof row.record_id !== "string" || typeof row.payload !== "string")
        throw new Error();
      const prior = unique.get(row.record_id);
      if (prior) {
        if (prior !== row.payload) throw new Error();
        continue;
      }
      unique.set(row.record_id, row.payload);
      const o = JSON.parse(row.payload);
      if (
        o.schemaVersion !== "1.0.0" ||
        (o.type.startsWith("model.")
          ? o.captureVersion !== MODEL_CAPTURE_VERSION
          : o.captureVersion !== PRACTICE_CAPTURE_VERSION) ||
        o.actor !== "model" ||
        o.termsVersion !== null ||
        o.participantId !== modelParticipant(slot.model) ||
        o.sessionId !== `run-${slot.run_id}` ||
        o.observationId !== row.record_id ||
        o.challenge !== key ||
        o.challengeRevision !== revision ||
        o.type.endsWith("capture-gap")
      )
        throw new Error();
      if (
        !o.source?.id ||
        !integer(o.source.sequence) ||
        !Number.isFinite(o.elapsedMs) ||
        o.elapsedMs < 0 ||
        !Number.isFinite(Date.parse(o.occurredAt)) ||
        o.observationId !== `${o.source.id}.${o.source.sequence}`
      )
        throw new Error();
      observations.push(o);
    }
    const sources = new Map<string, any[]>();
    for (const o of observations) {
      const s = sources.get(o.source.id) ?? [];
      s.push(o);
      sources.set(o.source.id, s);
    }
    for (const [id, os] of sources) {
      const ordered = orderSource(
        modelParticipant(slot.model),
        id,
        os.map((o) => ({
          observationId: o.observationId,
          sequence: o.source.sequence,
        })),
      );
      if (
        ordered.missing.positionCount ||
        ordered.conflicts.length ||
        ordered.unordered.length
      )
        throw new Error();
    }
    const starts = observations.filter((o) => o.type === "model.run-started"),
      ends = observations.filter((o) => o.type === "model.ended"),
      opened = observations.filter((o) => o.type === "practice.opened");
    if (starts.length !== 1 || ends.length !== 1 || opened.length !== 1)
      throw new Error();
    const start = starts[0].data,
      end = ends[0].data,
      practice = opened[0].data;
    if (
      start.runId !== slot.run_id ||
      start.model !== slot.model ||
      start.harnessVersion !== slot.harness_version ||
      start.try !== slot.try ||
      start.systemPrompt !== SYSTEM_PROMPT ||
      canonical(start.tools) !== canonical(TOOLS) ||
      start.request?.model !== slot.model
    )
      throw new Error();
    const effort = JSON.parse(slot.condition).reasoning;
    if (
      effort === "default"
        ? start.request.reasoning !== undefined
        : start.request.reasoning?.effort !== effort
    )
      throw new Error();
    if (
      !integer(start.budget?.turns) ||
      !integer(start.budget?.submissions) ||
      !integer(end.submissions) ||
      end.submissions !== slot.submissions ||
      end.outcome !== slot.outcome ||
      !["completed", "stopped", "budget", "refused", "error"].includes(
        end.outcome,
      )
    )
      throw new Error();
    const runtime = practice.runtime;
    if (
      !runtime ||
      typeof runtime !== "object" ||
      !runtime.id ||
      !runtime.version ||
      !Object.values(runtime).every((v) => typeof v === "string")
    )
      throw new Error();
    if (
      practice.editor?.name !== HARNESS_VERSION ||
      !Array.isArray(practice.editor.features) ||
      ![
        "edit-code-tool",
        "write-code-tool",
        "run-examples-tool",
        "submit-tool",
      ].every((f) => practice.editor.features.includes(f))
    )
      throw new Error();
    const allowedFeatures = [
      "whole-file-view",
      "edit-code-tool",
      "write-code-tool",
      "run-examples-tool",
      "submit-tool",
      "type-diagnostics",
    ];
    if (
      !practice.editor.features.every((f: string) =>
        allowedFeatures.includes(f),
      )
    )
      throw new Error();
    const runtimeKeys = [
      "id",
      "version",
      "python",
      "transpiler",
      "postgres",
      "php",
      "ruby",
      "go",
      "clang",
      "dotnet",
      "java",
    ];
    if (
      !Object.keys(runtime).every((k) => runtimeKeys.includes(k)) ||
      !Object.values(runtime).every(
        (v) =>
          typeof v === "string" &&
          v.length <= 128 &&
          /^[a-zA-Z0-9 ._+():/-]+$/.test(v),
      )
    )
      throw new Error();
    const submitted = observations.filter(
      (o) => o.type === "practice.submitted",
    );
    const runIds = new Set(submitted.map((o) => o.data.runId));
    if (submitted.length !== runIds.size || runIds.size !== end.submissions)
      throw new Error();
    if (
      end.outcome === "completed" &&
      !observations.some(
        (o) =>
          o.type === "practice.completed" &&
          submitted.some(
            (s) =>
              s.data.runId === o.data.runId &&
              s.data.result === "passed" &&
              s.data.total > 0 &&
              s.data.passed === s.data.total &&
              s.data.rules.length === 0,
          ),
      )
    )
      throw new Error();
    const reports = observations
      .filter((o) => o.type === "model.response" && o.data.error === null)
      .map((o) => o.data.model)
      .filter(safeModel);
    if (new Set(reports).size > 8) throw new Error();
    const catalogs = observations.filter(
      (o) => o.type === "model.catalog" && o.data.at === "start",
    );
    const entry =
      catalogs.length === 1 && catalogs[0].data.listing?.status === 200
        ? catalogs[0].data.listing.entry
        : null;
    const declared =
      entry?.id === slot.model ? entry.reasoning?.default_effort : null;
    const defaultReasoning =
      effort === "default"
        ? "default"
        : EFFORTS.includes(declared)
          ? declared
          : null;
    const completion = observations.find(
      (o) => o.type === "practice.completed",
    );
    const final =
      completion &&
      submitted.find(
        (o) =>
          o.data.runId === completion.data.runId &&
          o.source.id === completion.source.id,
      );
    const artifact = final && artifacts.get(final.data.codeArtifactId);
    const finalCodeLength =
      end.outcome === "completed" &&
      artifact?.artifactId === completion?.data.codeArtifactId &&
      artifact?.revision === final?.data.revision
        ? codeLength(artifact, modelParticipant(slot.model))
        : null;
    return {
      ...base,
      defaultReasoning,
      finalCodeLength,
      state: end.outcome,
      reportedModels: [...new Set(reports)].sort(),
      submissions: end.submissions,
      runtime,
      features: [...practice.editor.features].sort(),
      budget: {
        turns: start.budget.turns,
        submissions: start.budget.submissions,
      },
    };
  } catch {
    return base;
  }
}
export function receiptMatch(
  receipt: ModelReceipt,
  conditions: readonly string[],
): "matched" | "runtime-mismatch" | "diagnostics-mismatch" | "unknown-context" {
  try {
    const runtimes = conditions.filter((c) => c.startsWith("Runtime: "));
    const editors = conditions.filter((c) => c.startsWith("Editor: "));
    if (
      runtimes.length !== 1 ||
      editors.length !== 1 ||
      !receipt.runtime ||
      receipt.reportedModels.length !== 1
    )
      return "unknown-context";
    if (
      canonical(JSON.parse(runtimes[0].slice(9)) as Json) !==
      canonical(receipt.runtime)
    )
      return "runtime-mismatch";
    const features = editors[0].split("; features: ")[1]?.split(", ");
    if (!features) return "unknown-context";
    if (
      features.includes("type-diagnostics") !==
      receipt.features.includes("type-diagnostics")
    )
      return "diagnostics-mismatch";
    if (features.some((f) => /autocomplete|ai-completion|copilot/i.test(f)))
      return "unknown-context";
    return "matched";
  } catch {
    return "unknown-context";
  }
}
