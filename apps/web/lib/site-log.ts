/**
 * Records site activity (page views, the page's state, arrival, profile answers, sharing,
 * stars) on this device for anyone who accepted the current Terms, stamped with that version,
 * for the uploader to send. One source stream per page load; positions are assigned in call
 * order and writes retry with the same ids, so retried records deduplicate.
 */
import { PAGE_SESSION_ID } from "../../../packages/browser/page-session";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../packages/browser/practice-store";
import { randomId } from "../../../packages/browser/random-id";
import type { Json } from "../../../packages/domain/json";
import type { EnvelopeInput, StoredRecord } from "../../../packages/domain/records";
import {
  siteArrival,
  sitePage,
  siteProfile,
  siteRecord,
  siteShare,
  siteStar,
  siteView,
  type ArrivalData,
  type PageData,
  type ProfileData,
  type ShareData,
  type SiteObservation,
  type StarData,
  type ViewData,
} from "../../../packages/domain/site";
import { readProfile } from "./account";
import { acceptsCurrent } from "./legal";

const sourceId = `site-${randomId()}`;
let sequence = 0;
let store: Promise<PracticeStore> | null = null;
const pending: StoredRecord[] = [];

/** The app page before the current one in this tab, for practice's `entry`. */
export const PREVIOUS_PATH_KEY = "muscle-memory.previous-path";

/** Where an arrival is remembered until the Terms are accepted and it can be recorded. */
const ARRIVAL_KEY = "muscle-memory.arrival";

type Challenge = { key: string; revision: string };

/**
 * Remembers the first landing page and any referral code, before anything may be recorded.
 * Only the first landing counts; a later shared link does not overwrite it.
 */
export function noteArrival(ref: string | null, landing = location.pathname + location.search): void {
  try {
    if (localStorage.getItem(ARRIVAL_KEY)) return;
    const arrival = {
      ref: ref && /^[a-z0-9]{6,32}$/.test(ref) ? ref : null,
      landing,
      landedAt: new Date().toISOString(),
      recorded: false,
    };
    localStorage.setItem(ARRIVAL_KEY, JSON.stringify(arrival));
  } catch {
    // Storage can be unavailable; the arrival then goes unrecorded.
  }
}

/** Records the remembered arrival once the Terms are accepted; once only. */
export async function logArrival(): Promise<void> {
  let arrival: (ArrivalData & { recorded: boolean }) | null = null;
  try {
    arrival = JSON.parse(localStorage.getItem(ARRIVAL_KEY) ?? "null");
  } catch {
    return;
  }
  if (!arrival || arrival.recorded) return;
  const { ref, landing, landedAt } = arrival;
  localStorage.setItem(ARRIVAL_KEY, JSON.stringify({ ...arrival, recorded: true }));
  await log((base) => siteArrival({ ...base, data: { ref, landing, landedAt } }), "Arrival");
}

export function logShare(challenge: Challenge, data: ShareData): Promise<boolean> {
  return log((base) => siteShare({ ...base, challenge, data }), "Share");
}

export function logView(challenge: Challenge | null, data: ViewData): Promise<boolean> {
  return log((base) => siteView({ ...base, challenge, data }), "Page view");
}

export function logPage(data: PageData): Promise<boolean> {
  return log((base) => sitePage({ ...base, data }), "Page state");
}

export function logStar(challenge: Challenge, starred: boolean, data: StarData): Promise<boolean> {
  return log((base) => siteStar({ ...base, challenge, starred, data }), "Star");
}

/**
 * The profile as now saved, after an answer given `from` somewhere: every answer, which ones
 * the person gave themselves, and stealth.
 */
export function logProfile(from: ProfileData["from"]): Promise<boolean> {
  const stored = readProfile();
  if (!stored) return Promise.resolve(false);
  const answered = Object.entries(stored.asked ?? {})
    .filter(([, asked]) => asked?.answeredAt)
    .map(([id]) => id);
  const answers = { ...stored.profile, answered, stealth: stored.stealth ?? false } as Json;
  return log((base) => siteProfile({ ...base, data: { from, answers } }), "Profile answers");
}

/**
 * The challenge the page on screen is about, set by that page so its view names the challenge
 * and the revision live at the time. Children's effects run before the layout's, so it is set by
 * the time the view is recorded.
 */
let context: { path: string; challenge: Challenge } | null = null;

export function setChallengeContext(challenge: Challenge | null): () => void {
  const path = location.pathname;
  context = challenge ? { path, challenge } : null;
  return () => {
    if (context?.path === path) context = null;
  };
}

export function challengeContext(path: string): Challenge | null {
  return context?.path === path ? context.challenge : null;
}

async function log(
  build: (base: EnvelopeInput) => SiteObservation,
  what: string,
): Promise<boolean> {
  const accepted = readProfile()?.accepted;
  // The gate keeps people without current acceptance out; this is the belt to its braces.
  if (!accepted || !acceptsCurrent(accepted)) return false;
  // Claim the position and time now, so order matches what the person did.
  const position = ++sequence;
  const occurredAt = new Date().toISOString();
  // performance.now() counts from this page load, which is this source stream.
  const elapsedMs = Math.round(performance.now() * 10) / 10;
  try {
    store ??= openPracticeStore();
    const opened = await store;
    pending.push(
      siteRecord(
        build({
          participantId: await opened.participantId(),
          sessionId: PAGE_SESSION_ID,
          sourceId,
          sequence: position,
          occurredAt,
          elapsedMs,
          termsVersion: accepted.version,
        }),
      ),
    );
    const batch = pending.splice(0);
    try {
      await opened.write(batch);
    } catch (cause) {
      pending.unshift(...batch);
      throw cause;
    }
    return true;
  } catch (cause) {
    store = null;
    // A missed position stays visible as a gap in the source stream.
    console.warn(`${what} was not recorded.`, cause);
    return false;
  }
}
