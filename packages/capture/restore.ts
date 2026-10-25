/**
 * Recovers every editable file this participant saved on this device for one issue, whichever
 * revision it was written against. Each
 * source stream (one page load) is replayed on its own: start from a complete code artifact
 * (the opening document or a snapshot), then apply saved edit change sets in strict source
 * order. Replay stops at the first missing position, explicit gap, truncated or invalid
 * change, or inconsistency, and keeps the last document known to be exact. A later complete
 * snapshot is a new safe starting point. Streams are never combined.
 */
import { ChangeSet, Text } from "@codemirror/state";
import type {
  CodeRevisionArtifact,
  WorkspaceObservation,
  WorkspaceRecord,
} from "../domain/workspace";

export interface RecoveredCode {
  /** Every editable file, by path. */
  readonly files: Readonly<Record<string, string>>;
  readonly revision: number;
  readonly sourceId: string;
  /** False when later saved activity in that stream could not be applied safely. */
  readonly complete: boolean;
  /** Latest revision seen in the stream, which may be beyond what was recovered. */
  readonly latestRevision: number;
  readonly reason?: string;
  /** True when the latest session had nothing recoverable and an earlier one was used. */
  readonly fromEarlierSession: boolean;
}

interface Replayed {
  readonly docs: ReadonlyMap<string, Text>;
  readonly revision: number;
}

interface StreamResult {
  readonly sourceId: string;
  readonly lastOccurredAt: string;
  readonly best?: { files: Record<string, string>; revision: number };
  readonly latestRevision: number;
  readonly reason?: string;
}

export function latestSavedCode(
  records: readonly WorkspaceRecord[],
  participantId: string,
  issue: string,
): RecoveredCode | null {
  const artifacts = new Map<string, CodeRevisionArtifact>();
  const streams = new Map<string, WorkspaceObservation[]>();
  for (const record of records) {
    if (record.participantId !== participantId) continue;
    const value = JSON.parse(record.payload);
    if (value.type === "artifact.code-revision")
      artifacts.set(value.artifactId, value);
    else if (
      value.observationId &&
      value.type?.startsWith("observation.workspace.") &&
      value.issue === issue
    ) {
      const stream = streams.get(value.source.id) ?? [];
      stream.push(value);
      streams.set(value.source.id, stream);
    }
  }
  const results = [...streams.entries()]
    .map(([sourceId, observations]) =>
      replay(sourceId, observations, artifacts, participantId),
    )
    .sort((a, b) => b.lastOccurredAt.localeCompare(a.lastOccurredAt));
  for (const [index, result] of results.entries()) {
    if (!result.best) continue;
    return {
      files: result.best.files,
      revision: result.best.revision,
      sourceId: result.sourceId,
      complete: result.reason === undefined && index === 0,
      latestRevision: result.latestRevision,
      reason:
        index === 0
          ? result.reason
          : (results[0].reason ?? "the latest session had no saved code"),
      fromEarlierSession: index > 0,
    };
  }
  return null;
}

function replay(
  sourceId: string,
  observations: WorkspaceObservation[],
  artifacts: ReadonlyMap<string, CodeRevisionArtifact>,
  participantId: string,
): StreamResult {
  observations.sort((a, b) => a.source.sequence - b.source.sequence);
  let current: Replayed | null = null;
  let best: { files: Record<string, string>; revision: number } | undefined;
  let reason: string | undefined;
  let latestRevision = 0;
  let previous = 0;
  const lose = (why: string) => {
    current = null;
    reason ??= why;
  };
  for (const observation of observations) {
    const { sequence } = observation.source;
    if (sequence === previous) {
      lose("two saved records claim the same position");
      continue;
    }
    if (sequence !== previous + 1)
      lose(`saved activity ${previous + 1}–${sequence - 1} is missing`);
    previous = sequence;
    const data = observation.data as unknown as Record<string, unknown>;
    if (typeof data.revision === "number")
      latestRevision = Math.max(latestRevision, data.revision);
    switch (observation.type) {
      case "observation.workspace.opened":
      case "observation.workspace.snapshot": {
        const artifact = artifacts.get(data.codeArtifactId as string);
        const usable =
          artifact &&
          artifact.participantId === participantId &&
          !artifact.truncated &&
          artifact.revision === data.revision;
        if (!usable) {
          // A snapshot that cannot be used does not break an exact replay in progress.
          if (current?.revision !== data.revision)
            lose("a saved snapshot is missing or truncated");
          break;
        }
        // A complete snapshot is exact: a new safe starting point after any earlier loss.
        current = {
          docs: new Map(
            Object.entries(artifact.files).map(([path, f]) => [
              path,
              toText(f.text),
            ]),
          ),
          revision: artifact.revision,
        };
        reason = undefined;
        break;
      }
      case "observation.workspace.edit": {
        const next: Replayed | null = current ? apply(current, data) : null;
        if (next) current = next;
        else if (current)
          lose("a saved edit was truncated or could not be applied");
        break;
      }
      case "observation.workspace.capture-gap":
        lose("some activity was not saved");
        break;
    }
    if (current)
      best = {
        files: Object.fromEntries(
          [...current.docs].map(([path, doc]) => [path, doc.toString()]),
        ),
        revision: current.revision,
      };
  }
  // Complete only if replay is still exact after the last stored record of the stream.
  return {
    sourceId,
    lastOccurredAt: observations.at(-1)?.occurredAt ?? "",
    best,
    latestRevision,
    reason: current
      ? undefined
      : (reason ?? "later activity could not be recovered"),
  };
}

function apply(
  current: Replayed,
  data: Record<string, unknown>,
): Replayed | null {
  const before = current.docs.get(String(data.file));
  if (
    !before ||
    data.revision !== current.revision + 1 ||
    data.changes === null
  )
    return null;
  try {
    const changes = ChangeSet.fromJSON(data.changes);
    if (changes.length !== before.length) return null;
    const doc = changes.apply(before);
    if (doc.length !== data.docLength) return null;
    const docs = new Map(current.docs);
    docs.set(String(data.file), doc);
    return { docs, revision: current.revision + 1 };
  } catch {
    return null;
  }
}

/** Same line splitting as the editor, so replayed text compares exactly. */
function toText(text: string): Text {
  return Text.of(text.split(/\r\n?|\n/));
}
