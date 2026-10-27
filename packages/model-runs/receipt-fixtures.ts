/** Synthetic receipt only; no model call, player data or reference solution. */
import { envelope, toRecord } from "../domain/records";
import { modelParticipant } from "../domain/model";
import { HARNESS_VERSION, SYSTEM_PROMPT, TOOLS } from "./tools";
import { rowOf } from "./rows";
import type { ReceiptSlot } from "./receipts";
export const slot: ReceiptSlot = {
  model: "synthetic/model",
  harness_version: HARNESS_VERSION,
  condition: '{"reasoning":"high"}',
  try: 1,
  status: "finished",
  outcome: "completed",
  run_id: "synthetic-run",
  submissions: 1,
};
export function receiptText(changed?: (observations: any[]) => void): string {
  const os: any[] = [];
  const seq = { model: 0, practice: 0 };
  const add = (type: string, data: any) => {
    const stream = type.startsWith("model.") ? "model" : "practice";
    os.push(
      envelope(
        type,
        type.startsWith("model.")
          ? "model-capture-1.0.0"
          : "practice-capture-1.2.0",
        {
          participantId: modelParticipant(slot.model),
          sessionId: `run-${slot.run_id}`,
          sourceId: `${stream}-synthetic`,
          sequence: ++seq[stream],
          elapsedMs: seq[stream] * 10,
          occurredAt: "2026-10-27T00:00:00Z",
          actor: "model",
          termsVersion: null,
          challenge: { key: "JS-001", revision: `sha256:${"a".repeat(64)}` },
          attemptId: "model-attempt",
        },
        data,
      ),
    );
  };
  add("model.run-started", {
    runId: slot.run_id,
    model: slot.model,
    harnessVersion: HARNESS_VERSION,
    try: 1,
    systemPrompt: SYSTEM_PROMPT,
    tools: TOOLS,
    request: { model: slot.model, reasoning: { effort: "high" } },
    budget: { turns: 50, submissions: 10 },
    environment: { syntheticPrivateMarker: "NEVER_PUBLIC" },
  });
  add("model.response", {
    model: "synthetic/model-2026-10-27",
    error: null,
    message: { content: "SYNTHETIC_PRIVATE_CODE" },
  });
  add("model.ended", { outcome: "completed", submissions: 1 });
  add("practice.opened", {
    runtime: { id: "browser-javascript", version: "3.35.1" },
    editor: {
      name: HARNESS_VERSION,
      features: [
        "whole-file-view",
        "edit-code-tool",
        "write-code-tool",
        "run-examples-tool",
        "submit-tool",
      ],
    },
  });
  add("practice.submitted", {
    runId: "r",
    result: "passed",
    total: 3,
    passed: 3,
    rules: [],
  });
  add("practice.completed", { runId: "r" });
  changed?.(os);
  return os
    .map((o) => JSON.stringify(rowOf(toRecord(o), "2026-10-27T00:00:00Z")))
    .join("\n");
}
