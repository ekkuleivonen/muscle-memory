/** Numeric-only comparison helpers. Length counts Unicode code points, including whitespace. */
import type { ModelReceipt } from "./receipts";
import type { StoredRecord } from "../domain/records";
export function codeLength(artifact: any, participant: string): number | null {
  if (
    artifact?.type !== "artifact.code-revision" ||
    artifact.participantId !== participant ||
    artifact.truncated !== false ||
    !artifact.files ||
    typeof artifact.files !== "object"
  )
    return null;
  const files = Object.values(artifact.files) as any[];
  if (
    files.length !== 1 ||
    files.some(
      (f) =>
        typeof f.text !== "string" ||
        f.capture?.truncated !== false ||
        f.capture?.capturedBytes !== new TextEncoder().encode(f.text).length ||
        f.capture?.originalBytes !== f.capture?.capturedBytes,
    )
  )
    return null;
  return Array.from(files[0].text).length;
}
/** Exactly the code attached to the latest successful submission, never the subsequently edited document. */
export function solvedLength(
  records: readonly StoredRecord[],
  challenge: string,
  revision: string,
  attempt: string,
): number | null {
  try {
    const values = records.map((r) => JSON.parse(r.payload));
    const complete = values
      .filter(
        (o) =>
          o.type === "practice.completed" &&
          o.actor === "person" &&
          o.challenge === challenge &&
          o.challengeRevision === revision &&
          o.attemptId === attempt,
      )
      .sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) ||
          b.source.sequence - a.source.sequence,
      )[0];
    if (!complete) return null;
    const submitted = values.find(
      (o) =>
        o.type === "practice.submitted" &&
        o.participantId === complete.participantId &&
        o.attemptId === attempt &&
        o.source.id === complete.source.id &&
        o.challengeRevision === revision &&
        o.data.runId === complete.data.runId &&
        o.data.result === "passed",
    );
    const copies = values.filter(
      (o) =>
        o.type === "artifact.code-revision" &&
        o.artifactId === submitted?.data.codeArtifactId,
    );
    if (
      !copies.length ||
      new Set(copies.map((a) => JSON.stringify(a))).size !== 1
    )
      return null;
    return codeLength(copies[0], complete.participantId);
  } catch {
    return null;
  }
}
export function lengthDelta(
  user: number | null,
  model: number | null,
): number | null {
  if (
    user === null ||
    model === null ||
    !Number.isSafeInteger(user) ||
    user < 0 ||
    !Number.isSafeInteger(model) ||
    model <= 0
  )
    return null;
  return Math.round(((user - model) / model) * 100);
}
export interface DefaultComparison {
  model: string;
  receipt: ModelReceipt | null;
}
/** First try wins, including failure. Conflicting duplicates fail closed; never choose the best outcome. */
export function defaultComparisons(
  receipts: readonly ModelReceipt[],
): DefaultComparison[] {
  return [...new Set(receipts.map((r) => r.model))].sort().map((model) => {
    const rows = receipts.filter((r) => r.model === model);
    const declared = [
      ...new Set(rows.map((r) => r.defaultReasoning).filter((v) => v != null)),
    ];
    const effort = declared.length === 1 ? declared[0] : null;
    const eligible = rows.filter(
      (r) =>
        r.reasoning === "default" ||
        (effort !== null && r.reasoning === effort),
    );
    // Prefer explicit provider-default protocol if present. No fallback to a different effort.
    const explicit = eligible.filter((r) => r.reasoning === "default");
    const candidates = (explicit.length ? explicit : eligible).sort(
      (a, b) => a.try - b.try,
    );
    const first = candidates[0];
    const duplicates = first
      ? candidates.filter((r) => r.try === first.try)
      : [];
    const receipt =
      first && new Set(duplicates.map((r) => JSON.stringify(r))).size === 1
        ? first
        : null;
    return { model, receipt };
  });
}
