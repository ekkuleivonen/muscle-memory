/** Finds the most recent complete code snapshot this participant saved on this device. */
import type {
  CodeRevisionArtifact,
  WorkspaceObservation,
  WorkspaceRecord,
} from "../domain/workspace";

export function latestSavedCode(
  records: readonly WorkspaceRecord[],
  participantId: string,
): { text: string; revision: number } | null {
  const artifacts = new Map<string, CodeRevisionArtifact>();
  const snapshots: WorkspaceObservation<"observation.workspace.snapshot">[] =
    [];
  for (const record of records) {
    if (record.participantId !== participantId) continue;
    const value = JSON.parse(record.payload);
    if (value.type === "artifact.code-revision")
      artifacts.set(value.artifactId, value);
    else if (value.type === "observation.workspace.snapshot")
      snapshots.push(value);
  }
  snapshots.sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) ||
      b.source.sequence - a.source.sequence,
  );
  for (const snapshot of snapshots) {
    const artifact = artifacts.get(snapshot.data.codeArtifactId);
    // A truncated snapshot is a prefix; never restore it as if it were the whole file.
    if (artifact && !artifact.capture.truncated)
      return { text: artifact.text, revision: artifact.revision };
  }
  return null;
}
