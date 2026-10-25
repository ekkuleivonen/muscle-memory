import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTime, RESTORED_SELECTION, type TimedObservation } from "./active-time";

const at = (s: number) => new Date(Date.UTC(2026, 9, 25, 10, 0, s)).toISOString();
let sequence = 0;
const o = (
  type: string,
  s: number,
  data: Record<string, unknown> = {},
  source = "workspace-a",
): TimedObservation => ({
  type: `observation.workspace.${type}`,
  occurredAt: at(s),
  source: { id: source, sequence: ++sequence },
  data,
});

test("gaps between activity count up to a minute each", () => {
  assert.equal(activeTime([o("edit", 0), o("edit", 10), o("keys", 30)]), 30_000);
  // A long break counts as one minute, not as the break.
  assert.equal(activeTime([o("edit", 0), o("edit", 600)]), 60_000);
  // The page and the runtime getting ready are not activity.
  assert.equal(activeTime([o("opened", 0), o("runtime", 20), o("edit", 25)]), 0);
});

test("time with the page hidden is a pause, not work", () => {
  const records = [
    o("edit", 0),
    o("page", 5, { visible: false, focused: false }),
    o("page", 45, { visible: true, focused: true }),
    o("edit", 50),
  ];
  // 50 s between edits, 40 of them in another tab.
  assert.equal(activeTime(records), 10_000);
  // Still hidden when the stream ends: nothing after the last activity counts anyway.
  assert.equal(activeTime([o("edit", 0), o("page", 5, { visible: false })]), 0);
});

test("separate page loads are never joined, so leaving and coming back adds nothing", () => {
  const records = [
    o("edit", 0, {}, "workspace-a"),
    o("edit", 20, {}, "workspace-a"),
    // Reviewing the pull request on its page, then back in the IDE.
    o("edit", 40, {}, "workspace-b"),
    o("edit", 45, {}, "workspace-b"),
  ];
  assert.equal(activeTime(records), 25_000);
});

test("waiting on the test runner is not work; the cursor the IDE puts back is not activity", () => {
  const run = (s: number, status: string) => o("run", s, { runId: "r1", status });
  assert.equal(
    activeTime([o("edit", 0), run(1, "queued"), run(9, "running"), run(12, "result"), o("edit", 20)]),
    1_000 + 8_000,
  );
  // Typing while it runs still counts.
  assert.equal(activeTime([run(0, "queued"), o("keys", 5), run(10, "result")]), 10_000);
  assert.equal(
    activeTime([
      o("selection", 0, { userEvent: RESTORED_SELECTION }),
      o("navigated", 1, { via: "app" }),
      o("edit", 30),
    ]),
    0,
  );
});
