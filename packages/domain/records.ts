/**
 * What both recorded streams share (docs/telemetry.md): the stored record, the envelope every
 * observation carries, code snapshots, and reading a run's outcome against its cases.
 *
 * Two streams record, each with its own capture version: `practice` (inside a challenge,
 * packages/domain/practice.ts) and `site` (everything else, packages/domain/site.ts). Every
 * observation names the participant (a random id, never a person), the page load it came from
 * (`sessionId`), its position in its source stream, when it happened (wall clock and a
 * monotonic clock), the Terms version accepted, the experiment assignments in force, and, when
 * it is about a challenge, the challenge, its exact revision and the attempt.
 *
 * Every observation also says who acted: a person, or a model run by the offline harness
 * (tools/model-runs, docs/model-runs.md). A model accepts no Terms, so its observations carry
 * no Terms version, and they are never uploaded through ingest or stored with people's.
 */
import { boundText, CAPTURE_LIMIT_BYTES, safeIdentifier } from "./capture";
import { canonical, type Json } from "./json";

/** What a store keeps and uploads: one canonical payload per stable id. */
export interface StoredRecord {
  readonly recordId: string;
  readonly kind: "observation" | "artifact";
  readonly participantId: string;
  readonly payload: string;
}

/** A challenge's permanent key: its language's code and three digits, PY-003. */
export const CHALLENGE_KEY = /^[A-Z][A-Z0-9]{0,4}-\d{3}$/;
/** A revision id: the SHA-256 of its content. */
export const REVISION = /^sha256:[0-9a-f]{64}$/;
/** A Terms version: a date, with a counter when they change more than once a day. */
export const TERMS_VERSION = /^\d{4}-\d{2}-\d{2}(\.\d+)?$/;

/** Experiment arms in force, by experiment id. Empty until there are experiments. */
export type Assignments = Readonly<Record<string, string>>;
/** Who acted: a person in the app, or a model in the offline harness. */
export type Actor = "person" | "model";

export interface Envelope<T extends string, D> {
  readonly schemaVersion: "1.0.0";
  readonly type: T;
  readonly observationId: string;
  readonly participantId: string;
  /** One page load: shared by every stream recording during it. */
  readonly sessionId: string;
  readonly source: { readonly id: string; readonly sequence: number };
  readonly occurredAt: string;
  /** Milliseconds since the source stream started, on a monotonic clock (0.1 ms steps). */
  readonly elapsedMs: number;
  readonly captureVersion: string;
  readonly actor: Actor;
  /** The Terms and Privacy Notice version the participant accepted; null for a model. */
  readonly termsVersion: string | null;
  readonly assignments: Assignments;
  /** The challenge's key, such as PY-003, when the observation is about one. */
  readonly challenge: string | null;
  /** Its revision, sha256:… of its content. */
  readonly challengeRevision: string | null;
  /** The attempt at it, from `started` until the next start after completing. */
  readonly attemptId: string | null;
  readonly data: D;
}

/** The fields every observation's writer supplies before its type and data. */
export interface EnvelopeInput {
  readonly participantId: string;
  readonly sessionId: string;
  readonly sourceId: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly elapsedMs: number;
  /** A person unless told otherwise. */
  readonly actor?: Actor;
  /** Required for a person, null for a model. */
  readonly termsVersion: string | null;
  readonly assignments?: Assignments;
  readonly challenge?: { readonly key: string; readonly revision: string } | null;
  readonly attemptId?: string | null;
}

/** Builds and checks an envelope; data is checked by each stream. */
export function envelope<T extends string, D>(
  type: T,
  captureVersion: string,
  input: EnvelopeInput,
  data: D,
): Envelope<T, D> {
  const { participantId, sessionId, sourceId, sequence, occurredAt, elapsedMs, termsVersion } =
    input;
  safeIdentifier(participantId);
  safeIdentifier(sessionId);
  safeIdentifier(sourceId);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Source positions are positive whole numbers.");
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
    throw new Error("Observations need their elapsed time.");
  if (Number.isNaN(Date.parse(occurredAt))) throw new Error("Observations need a time.");
  const actor = input.actor ?? "person";
  if (actor === "person" ? !TERMS_VERSION.test(termsVersion ?? "") : actor !== "model")
    throw new Error("Observations name the accepted Terms version.");
  if (actor === "model" && termsVersion !== null)
    throw new Error("A model accepts no Terms.");
  const challenge = input.challenge ?? null;
  if (challenge) {
    if (!CHALLENGE_KEY.test(challenge.key)) throw new Error("Observations name a challenge by its key.");
    if (!REVISION.test(challenge.revision))
      throw new Error("Observations name the challenge's exact revision.");
  }
  const attemptId = input.attemptId ?? null;
  if (attemptId !== null) safeIdentifier(attemptId);
  const assignments = input.assignments ?? {};
  for (const [id, arm] of Object.entries(assignments)) {
    safeIdentifier(id);
    safeIdentifier(arm);
  }
  const observationId = `${sourceId}.${sequence}`;
  safeIdentifier(observationId);
  return {
    schemaVersion: "1.0.0",
    type,
    observationId,
    participantId,
    sessionId,
    source: { id: sourceId, sequence },
    occurredAt,
    elapsedMs,
    captureVersion,
    actor,
    termsVersion,
    assignments,
    challenge: challenge?.key ?? null,
    challengeRevision: challenge?.revision ?? null,
    attemptId,
    data,
  };
}

/** One file's text in a code revision, bounded on its own. */
export interface CodeFile {
  /** text/x-python, text/x-go, text/html, ...; always UTF-8. */
  readonly mediaType: string;
  readonly text: string;
  readonly capture: {
    readonly limitBytes: number;
    readonly originalBytes: number;
    readonly capturedBytes: number;
    readonly truncated: boolean;
  };
}

/** The editable file at one revision of the code, stored once and cited by id. */
export interface CodeRevisionArtifact {
  readonly schemaVersion: "1.0.0";
  readonly type: "artifact.code-revision";
  readonly artifactId: string;
  readonly participantId: string;
  readonly revision: number;
  readonly captureVersion: string;
  readonly files: Readonly<Record<string, CodeFile>>;
  /** True when a file was cut at the limit: then this copy cannot restore the code. */
  readonly truncated: boolean;
}

export function codeRevision(
  participantId: string,
  sourceId: string,
  revision: number,
  captureVersion: string,
  files: Readonly<Record<string, { text: string; mediaType: string }>>,
): CodeRevisionArtifact {
  const artifactId = `${sourceId}.code.${revision}`;
  safeIdentifier(artifactId);
  const bounded = Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, { text, mediaType }]): [string, CodeFile] => {
        const cut = boundText(text);
        return [
          path,
          {
            mediaType,
            text: cut.text,
            capture: {
              limitBytes: CAPTURE_LIMIT_BYTES,
              originalBytes: cut.originalBytes,
              capturedBytes: cut.capturedBytes,
              truncated: cut.truncated,
            },
          },
        ];
      }),
  );
  return {
    schemaVersion: "1.0.0",
    type: "artifact.code-revision",
    artifactId,
    participantId,
    revision,
    captureVersion,
    files: bounded,
    truncated: Object.values(bounded).some((f) => f.capture.truncated),
  };
}

export function toRecord(
  value: Envelope<string, unknown> | CodeRevisionArtifact,
): StoredRecord {
  const payload = canonical(value as unknown as Json);
  return "observationId" in value
    ? { recordId: value.observationId, kind: "observation", participantId: value.participantId, payload }
    : { recordId: value.artifactId, kind: "artifact", participantId: value.participantId, payload };
}

/**
 * Which cases a stored run outcome passed: each output must equal its case's expected value as
 * canonical JSON. Recomputed on demand; it never replaces the raw outcome.
 */
export function runFeedback(
  checks: readonly { readonly expected: Json }[],
  cases: readonly { output?: { text: string; truncated: boolean } }[],
): { passed: boolean[]; correct: number; total: number; unscorable: number[] } {
  const unscorable: number[] = [];
  const outputs = checks.map((_, index): Json => {
    const output = cases[index]?.output;
    if (!output || output.truncated) {
      unscorable.push(index);
      return null;
    }
    try {
      return JSON.parse(output.text);
    } catch {
      unscorable.push(index);
      return null;
    }
  });
  const passed = checks.map(
    (check, index) =>
      !unscorable.includes(index) && canonical(outputs[index]) === canonical(check.expected),
  );
  return { passed, correct: passed.filter(Boolean).length, total: passed.length, unscorable };
}
