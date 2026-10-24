/**
 * What the player can rely on after a refresh. A record count says nothing about whether the
 * latest code is recoverable, so this describes pending, failing and lost saves instead.
 */
import type { RecoveredCode } from "../../../../packages/capture/restore";
import type { SaveStatus } from "./session";

export function saveState(status: SaveStatus, onDevice: boolean): string {
  const stored = `${status.persisted} records stored`;
  if (!onDevice)
    return `Your code and activity are kept in this tab only and are lost when it closes (${stored}).`;
  if (!status.recoverable)
    return `Your latest code cannot be fully restored after a refresh: ${status.unrecoverableReason}. A refresh may bring back an earlier version. It is safe again once a complete copy is saved (Run saves one) (${stored}).`;
  if (status.retrying)
    return `Saving to this device is failing and will retry: ${status.lastError}. Your latest edits are not saved yet (${stored}).`;
  if (status.buffered)
    return `Saving your latest edits to this device… Edits still being saved are lost if the page closes now (${stored}).`;
  const earlier = status.gaps
    ? " Earlier activity has a capture gap, but your current code is saved completely."
    : "";
  return `All edits so far are saved on this device.${earlier} (${stored})`;
}

export function recoveryMessage(recovered: RecoveredCode): string {
  const from = recovered.fromEarlierSession ? " from an earlier session" : "";
  if (recovered.complete)
    return `Restored your latest saved code${from} (revision ${recovered.revision}).`;
  return `Restored revision ${recovered.revision}${from}, the latest code that could be recovered exactly. Later saved changes (up to revision ${recovered.latestRevision}) were not recovered: ${recovered.reason}.`;
}
