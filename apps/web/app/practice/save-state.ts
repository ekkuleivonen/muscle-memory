/**
 * What the player can rely on after a refresh, in an editor's words: pending, failing and lost
 * saves, never record counts or storage. The reasons behind a partial restore are recorded,
 * not shown.
 */
import type { RecoveredCode } from "../../../../packages/capture/restore";
import type { SaveStatus } from "./session";

export function saveState(status: SaveStatus, onDevice: boolean): string {
  if (!onDevice)
    return "Your work can't be saved right now and is lost if you close this tab.";
  if (!status.recoverable)
    return "Your latest code isn't fully saved: a reload may bring back an earlier version. Run the tests to save a complete copy.";
  if (status.retrying)
    return "Saving keeps failing and will retry. Your latest edits aren't saved yet.";
  if (status.buffered)
    return "Saving your latest edits… Anything still saving is lost if you close the page now.";
  return "All changes saved.";
}

export function recoveryMessage(recovered: RecoveredCode): string {
  const from = recovered.fromEarlierSession ? " from your last session" : "";
  if (recovered.complete) return `Restored your latest code${from}.`;
  if (recovered.fromEarlierSession)
    return "Restored your code from an earlier session; the most recent one couldn't be recovered. Check it before you continue.";
  if (recovered.latestRevision <= recovered.revision)
    return `Restored your code${from}. Some of your later activity couldn't be checked, but no newer code was found. Check it before you continue.`;
  return `Restored the latest code${from} that could be recovered exactly; your last few changes weren't. Check it before you continue.`;
}

/** A few words for the code pane's status; saveState() gives the full story as its tooltip. */
export function saveBadge(status: SaveStatus): {
  label: string;
  tone: "ok" | "busy" | "warn";
} {
  if (!status.recoverable) return { label: "Not fully saved", tone: "warn" };
  if (status.retrying) return { label: "Save failing, retrying", tone: "warn" };
  if (status.buffered) return { label: "Saving…", tone: "busy" };
  return { label: "Saved", tone: "ok" };
}
