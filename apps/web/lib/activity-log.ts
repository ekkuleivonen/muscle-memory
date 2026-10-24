/**
 * Consent for the board activity log. Opt-in only: without a stored consent for the current
 * version, nothing is recorded. Changing the disclosure means bumping BOARD_CONSENT_VERSION,
 * which asks again.
 */
import { BOARD_CONSENT_VERSION } from "../../../packages/domain/board";

export const ACTIVITY_KEY = "muscle-memory.activity-log";

export interface ActivityConsent {
  consentVersion: string;
  consentedAt: string;
}

/** The disclosure shown before asking, word for word what the consent version covers. */
export const ACTIVITY_DISCLOSURE = [
  "Keep a private activity log? Each time you change an issue's status (Backlog, Todo, In progress), it records which issue, from and to, when, whether you used the mouse or keyboard, how many issues were on your board and whether you were nudged.",
  "It stays in this browser's storage under a random ID. Nothing is uploaded and research sharing is off. Turn it off or delete it any time in Settings.",
] as const;

export function parseConsent(raw: string | null): ActivityConsent | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<ActivityConsent> | null;
    return value?.consentVersion === BOARD_CONSENT_VERSION &&
      typeof value.consentedAt === "string"
      ? { consentVersion: value.consentVersion, consentedAt: value.consentedAt }
      : null;
  } catch {
    return null;
  }
}

export function consentRecord(at: string): string {
  return JSON.stringify({
    consentVersion: BOARD_CONSENT_VERSION,
    consentedAt: at,
  });
}
