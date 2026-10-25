import assert from "node:assert/strict";
import type { WorkspaceRecord } from "../../../packages/domain/workspace";

const record = (payload: object): WorkspaceRecord => ({
  recordId: Math.random().toString(36),
  kind: "observation",
  participantId: "p",
  payload: JSON.stringify(payload),
});

const records: WorkspaceRecord[] = [
  record({
    type: "observation.board.moved",
    occurredAt: "2026-10-24T09:00:00.000Z",
    issue: "reset-link-expiry",
    data: { issueKey: "PHP-002", from: "backlog", to: "todo" },
  }),
  record({
    type: "observation.workspace.opened",
    occurredAt: "2026-10-23T09:00:00.000Z",
    issue: "frequency-map",
    data: {},
  }),
  record({
    type: "observation.workspace.edit",
    occurredAt: "2026-10-23T09:01:00.000Z",
    issue: "frequency-map",
    data: {},
  }),
  record({
    type: "observation.workspace.run",
    occurredAt: "2026-10-23T09:02:00.000Z",
    issue: "frequency-map",
    data: { status: "started" },
  }),
  record({
    type: "observation.workspace.run",
    occurredAt: "2026-10-23T09:03:00.000Z",
    issue: "frequency-map",
    data: { status: "result" },
  }),
  { recordId: "a", kind: "artifact", participantId: "p", payload: "{}" },
  { recordId: "b", kind: "observation", participantId: "p", payload: "nope" },
];
