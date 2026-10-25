/**
 * Source-ordered reading of observations. A source stream is one participant's one
 * source ID; its positions start at 1 and never reset. A restarted source (new process,
 * device or tab) must use a new source ID rather than reusing positions.
 */

export const MAX_GAP_RANGES = 100;

export interface SourcePosition {
  readonly observationId: string;
  readonly sequence: unknown;
}

export interface SourceStream {
  readonly participantId: string;
  readonly sourceId: string;
  /** Captured observations by sequence (then observation ID); arrival order plays no part. */
  readonly observations: readonly {
    readonly sequence: number;
    readonly observationId: string;
  }[];
  readonly highestSequence: number | null;
  /**
   * Positions before `highestSequence` with no captured observation. They were not
   * observed: that is not evidence that nothing happened, and a late arrival may fill them.
   * Positions after `highestSequence` are unknown and are not reported.
   */
  readonly missing: {
    readonly ranges: readonly { readonly from: number; readonly to: number }[];
    readonly rangeCount: number;
    readonly positionCount: number;
    /** True when only the first `maxRanges` ranges are listed. */
    readonly truncated: boolean;
  };
  /** Positions claimed by several observations; only records stored before position checks can do this. */
  readonly conflicts: readonly {
    readonly sequence: number;
    readonly observationIds: readonly string[];
  }[];
  /** Observations whose sequence is not a positive safe integer; kept, but not placed in order. */
  readonly unordered: readonly string[];
}

/** Deterministic for the same records; work and output are bounded by record count and `maxRanges`. */
export function orderSource(
  participantId: string,
  sourceId: string,
  positions: readonly SourcePosition[],
  maxRanges = MAX_GAP_RANGES,
): SourceStream {
  const unordered: string[] = [];
  const observations: { sequence: number; observationId: string }[] = [];
  for (const { observationId, sequence } of positions) {
    if (isPosition(sequence)) observations.push({ sequence, observationId });
    else unordered.push(observationId);
  }
  observations.sort(
    (a, b) =>
      a.sequence - b.sequence || (a.observationId < b.observationId ? -1 : 1),
  );
  unordered.sort();

  const ranges: { from: number; to: number }[] = [];
  const conflicts: { sequence: number; observationIds: string[] }[] = [];
  let rangeCount = 0;
  let positionCount = 0;
  let previous = 0;
  for (let index = 0; index < observations.length; index++) {
    const { sequence, observationId } = observations[index];
    if (sequence === previous) {
      const last = conflicts.at(-1);
      if (last?.sequence === sequence) last.observationIds.push(observationId);
      else
        conflicts.push({
          sequence,
          observationIds: [
            observations[index - 1].observationId,
            observationId,
          ],
        });
      continue;
    }
    if (sequence > previous + 1) {
      rangeCount++;
      positionCount += sequence - previous - 1;
      if (ranges.length < maxRanges)
        ranges.push({ from: previous + 1, to: sequence - 1 });
    }
    previous = sequence;
  }
  return {
    participantId,
    sourceId,
    observations,
    highestSequence: observations.length ? previous : null,
    missing: {
      ranges,
      rangeCount,
      positionCount,
      truncated: rangeCount > ranges.length,
    },
    conflicts,
    unordered,
  };
}

/** A valid source position: a positive safe integer of JSON number type. */
export function isPosition(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}
