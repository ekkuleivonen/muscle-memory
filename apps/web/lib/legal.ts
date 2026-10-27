/**
 * The Terms and Privacy Notice are versioned together. Every account accepts the current
 * version before using the app; changing either page means a new version here, which asks
 * everyone again on their next visit (the session cookie carries it).
 */
export const LEGAL_VERSION = "2026-10-27";
/** Shown on the legal pages and in settings. */
export const LEGAL_UPDATED = "27 October 2026";
export const LEGAL_DRAFT = true;

export interface Acceptance {
  version: string;
  at: string;
}

export function acceptsCurrent(accepted: Acceptance | undefined): boolean {
  return accepted?.version === LEGAL_VERSION;
}
