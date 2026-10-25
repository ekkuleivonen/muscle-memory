/**
 * The site stream (docs/telemetry.md): what happens outside a challenge. Pages viewed (with
 * their search), the page's state, how someone first arrived, profile answers, sharing, and
 * stars. Typing in text fields is not recorded key by key: a search is recorded as the query it
 * produced. Challenge starts, submissions and completion are in the practice stream.
 */
import { boundText } from "./capture";
import type { Json } from "./json";
import {
  CHALLENGE_KEY,
  envelope,
  toRecord,
  type Envelope,
  type EnvelopeInput,
  type StoredRecord,
} from "./records";

export const SITE_CAPTURE_VERSION = "site-capture-1.0.0";
/** A page of the app was shown: its path, its query string, and the app page before it. */
export interface ViewData {
  readonly path: string;
  readonly query: string;
  readonly previous: string | null;
}

export interface PageData {
  readonly visible: boolean;
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
}

/** Where a profile answer was given: settings, or the language picked in quick start. */
export const PROFILE_SOURCES = ["settings", "quick-start"] as const;

/** The profile as saved after an answer, and where it was given. */
export interface ProfileData {
  readonly from: (typeof PROFILE_SOURCES)[number];
  readonly answers: Json;
}

/** How someone first came in: recorded once, after they accept the Terms. */
export interface ArrivalData {
  /** The referral code in the link that brought them, if any. */
  readonly ref: string | null;
  /** The first app page they landed on, and when (before the Terms, so not recorded then). */
  readonly landing: string;
  readonly landedAt: string;
}

/** A result card shared (the envelope names the challenge): where to, and the card. */
export interface ShareData {
  readonly channel: "copy" | "x" | "linkedin" | "native";
  /** This device's referral code, carried by the shared link. */
  readonly ref: string;
  readonly card: Json;
}

/** A challenge starred or unstarred (the envelope names it), and where. */
export interface StarData {
  readonly from: "picker" | "practice";
}

export interface SiteData {
  "site.viewed": ViewData;
  "site.page": PageData;
  "site.profile": ProfileData;
  "site.arrived": ArrivalData;
  "site.shared": ShareData;
  "site.starred": StarData;
  "site.unstarred": StarData;
}

export type SiteType = keyof SiteData;
export type SiteObservation<T extends SiteType = SiteType> = Envelope<T, SiteData[T]>;

const PAGE_PATH = /^\/[\w\-./%~]*$/;
const REFERRAL = /^[a-z0-9]{6,32}$/;

const site = <T extends SiteType>(type: T, input: EnvelopeInput, data: SiteData[T]) =>
  envelope(type, SITE_CAPTURE_VERSION, input, data);

export function siteView(input: EnvelopeInput & { data: ViewData }): SiteObservation<"site.viewed"> {
  const { path, query, previous } = input.data;
  if (!PAGE_PATH.test(path) || (previous !== null && !PAGE_PATH.test(previous.split("?")[0])))
    throw new Error("A page view names app paths.");
  return site("site.viewed", input, { path, query: boundText(query, 2048).text, previous });
}

export function sitePage(input: EnvelopeInput & { data: PageData }): SiteObservation<"site.page"> {
  const { visible, focused, width, height } = input.data;
  return site("site.page", { ...input, challenge: null }, {
    visible: Boolean(visible),
    focused: Boolean(focused),
    width: Math.round(width),
    height: Math.round(height),
  });
}

export function siteProfile(
  input: EnvelopeInput & { data: ProfileData },
): SiteObservation<"site.profile"> {
  if (!(PROFILE_SOURCES as readonly string[]).includes(input.data.from))
    throw new Error(`Profile answers come from ${PROFILE_SOURCES.join(", ")}.`);
  return site("site.profile", { ...input, challenge: null }, input.data);
}

export function siteArrival(
  input: EnvelopeInput & { data: ArrivalData },
): SiteObservation<"site.arrived"> {
  const { ref, landing, landedAt } = input.data;
  if (ref !== null && !REFERRAL.test(ref)) throw new Error("Unknown referral code.");
  if (!PAGE_PATH.test(landing.split("?")[0])) throw new Error("A landing page is an app path.");
  if (Number.isNaN(Date.parse(landedAt))) throw new Error("An arrival needs its time.");
  return site("site.arrived", { ...input, challenge: null }, {
    ref,
    landing: boundText(landing, 2048).text,
    landedAt,
  });
}

export function siteShare(
  input: EnvelopeInput & { data: ShareData },
): SiteObservation<"site.shared"> {
  const { channel, ref, card } = input.data;
  if (!input.challenge || !CHALLENGE_KEY.test(input.challenge.key)) throw new Error("A share names its challenge.");
  if (!["copy", "x", "linkedin", "native"].includes(channel)) throw new Error("Unknown channel.");
  if (!REFERRAL.test(ref)) throw new Error("Unknown referral code.");
  return site("site.shared", input, { channel, ref, card });
}

export function siteStar(
  input: EnvelopeInput & { starred: boolean; data: StarData },
): SiteObservation<"site.starred" | "site.unstarred"> {
  const { from } = input.data;
  if (!input.challenge || !CHALLENGE_KEY.test(input.challenge.key)) throw new Error("A star names its challenge.");
  if (from !== "picker" && from !== "practice") throw new Error("Unknown place to star from.");
  return site(input.starred ? "site.starred" : "site.unstarred", input, { from });
}

/** Stored like every observation: one canonical payload per stable id. */
export function siteRecord(observation: SiteObservation): StoredRecord {
  return toRecord(observation);
}
