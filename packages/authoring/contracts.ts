import type { ChallengeMetadata, Revision } from "../content/model";
import type { ChallengeSource } from "../content/source";
import type { RunOutcome } from "../runner/runner";
export interface RuntimePin {
  engine: string;
  version: string;
  fingerprint: string;
}
export interface EditorHead {
  key: string;
  generation: number;
  lifecycle: "draft" | "published" | "archived";
  publishedRevision: string | null;
  draftDigest: string | null;
  validation: "unvalidated" | "passed";
}
export interface EditorSummary extends EditorHead {
  title: string;
  language: string;
  hasDraft: boolean;
  benchmark: "blocked_configuration" | "unavailable";
}
export interface EditorDetail {
  head: EditorHead;
  source: ChallengeSource | null;
  runtime: RuntimePin | null;
}
export interface ValidationPlan {
  token: string;
  generation: number;
  draftDigest: string;
  runtime: RuntimePin;
  revision: Revision;
  expiresAt: string;
  runs: {
    id: string;
    code: string;
    codeDigest: string;
    expect: "correct" | "incorrect" | "starter";
  }[];
}
export interface ValidationRun {
  id: string;
  codeDigest: string;
  outcome: RunOutcome;
}
/** Public projection only; no private source or validation material. */
export interface HistoricalChallenge {
  metadata: ChallengeMetadata;
  revision: Revision;
  archived: boolean;
}
