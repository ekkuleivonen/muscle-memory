import type { StoredRecord } from "../../../packages/domain/records";
import type { ChallengeProgress } from "./progress";

const REVISION = /^sha256:[a-f0-9]{64}$/;

/** Recover the original pin from existing observations without changing their meaning. */
export function continuationRevision(
  key: string,
  progress: ChallengeProgress | undefined,
  records: readonly StoredRecord[],
): string | null {
  if (!progress) return null;
  if (progress.revision) return progress.revision;
  const observations = records.flatMap((record) => {
    if (record.kind !== "observation") return [];
    try {
      const value = JSON.parse(record.payload);
      return value.challenge === key &&
        value.attemptId === progress.attempt &&
        typeof value.challengeRevision === "string" &&
        REVISION.test(value.challengeRevision)
        ? [value as { challengeRevision: string; occurredAt?: string }]
        : [];
    } catch {
      return [];
    }
  });
  observations.sort((a, b) =>
    (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""),
  );
  return observations[0]?.challengeRevision ?? null;
}

/** Archived challenges admit only unfinished, identified local attempts. */
export function canContinueArchived(
  progress: ChallengeProgress | undefined,
  pin: string | null,
): boolean {
  return !!progress && progress.completedAt === null && pin !== null;
}
