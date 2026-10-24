import { entryKey, findEntry, requireEntry, describe } from "./gates";
export { entryKey, findEntry, startAttempt, assessAttempt } from "./gates";
export type { StartableAttempt } from "./gates";
/**
 * Local authoring lifecycle for versioned Adventure and Challenge content.
 *
 * draft → preview → tested → published → retired, plus immediate disabled from
 * published or retired. Every operation returns a new catalog and never removes
 * an entry, so old version snapshots and transition history stay readable.
 * Persistence lives in ./file-store.ts.
 */
import { createHash } from "node:crypto";
import {
  assess,
  canonical,
  encounter,
  snapshot,
  type Adventure,
  type Challenge,
  type Json,
} from "../domain/assessment";
import {
  requireSingleOwner,
  requireStableIdentity,
  validateAdventure,
  validateChallenge,
} from "../../tools/content-check.mjs";

export type ContentKind = "adventure" | "challenge";
export type LifecycleState =
  | "draft"
  | "preview"
  | "tested"
  | "published"
  | "retired"
  | "disabled";
export type LifecycleAction =
  | "drafted"
  | "edited"
  | "previewed"
  | "tested"
  | "published"
  | "retired"
  | "disabled";

export interface ContentRef {
  readonly kind: ContentKind;
  readonly id: string;
  readonly version: string;
}
export interface TestResult {
  /** Digest of the exact content that passed. Publication requires a match. */
  readonly digest: string;
  readonly fixtures: number;
  readonly at: string;
}
export interface Transition {
  readonly action: LifecycleAction;
  readonly from: LifecycleState | null;
  readonly to: LifecycleState;
  readonly digest: string;
  readonly at: string;
  readonly note?: string;
}
export interface CatalogEntry extends ContentRef {
  readonly content: Adventure | Challenge;
  /** SHA-256 of the canonical content snapshot. */
  readonly digest: string;
  readonly state: LifecycleState;
  readonly testResult: TestResult | null;
  readonly history: readonly Transition[];
}
export interface Catalog {
  readonly schemaVersion: "1.0.0";
  readonly entries: Readonly<Record<string, CatalogEntry>>;
}

const editableStates: readonly LifecycleState[] = [
  "draft",
  "preview",
  "tested",
];
/** States whose content is frozen for that id/version forever. */
const frozenStates: readonly LifecycleState[] = [
  "published",
  "retired",
  "disabled",
];

export function emptyCatalog(): Catalog {
  return { schemaVersion: "1.0.0", entries: {} };
}

export function contentDigest(content: Adventure | Challenge): string {
  return createHash("sha256")
    .update(canonical(content as unknown as Json))
    .digest("hex");
}

/** Validates one source manifest by kind. Adventure references are checked against the catalog. */
function validateSource(
  catalog: Catalog,
  kind: ContentKind,
  content: unknown,
): Adventure | Challenge {
  const versionsOf = (k: ContentKind, id: string) =>
    Object.values(catalog.entries).filter((e) => e.kind === k && e.id === id);
  if (kind === "challenge") {
    const challenge = validateChallenge(content) as Challenge;
    // An issue keeps its number across every version, whatever their state.
    requireStableIdentity(
      [],
      new Map(
        [...versionsOf("challenge", challenge.id), { content: challenge }].map(
          ({ content: c }, i) => [`${i}`, c as Challenge],
        ),
      ),
    );
    return challenge;
  }
  // Disabled Challenges cannot be referenced by new or edited Adventures.
  const challenges = new Map<string, Challenge>();
  for (const entry of Object.values(catalog.entries)) {
    if (entry.kind === "challenge" && entry.state !== "disabled")
      challenges.set(
        `${entry.id}@${entry.version}`,
        entry.content as Challenge,
      );
  }
  const adventure = validateAdventure(content, challenges) as Adventure;
  // Retired and disabled Adventures no longer own their Challenges.
  requireSingleOwner([
    ...Object.values(catalog.entries)
      .filter(
        (e) =>
          e.kind === "adventure" &&
          e.id !== adventure.id &&
          e.state !== "retired" &&
          e.state !== "disabled",
      )
      .map((e) => e.content as Adventure),
    adventure,
  ]);
  // Keys and issue numbers stay fixed across every version of this Adventure.
  const all = new Map<string, Challenge>();
  for (const e of Object.values(catalog.entries))
    if (e.kind === "challenge")
      all.set(`${e.id}@${e.version}`, e.content as Challenge);
  requireStableIdentity(
    [
      ...versionsOf("adventure", adventure.id).map(
        (e) => e.content as Adventure,
      ),
      adventure,
    ],
    all,
  );
  return adventure;
}

function withEntry(catalog: Catalog, entry: CatalogEntry): Catalog {
  return {
    ...catalog,
    entries: { ...catalog.entries, [entryKey(entry)]: entry },
  };
}

function requireState(
  entry: CatalogEntry,
  action: LifecycleAction,
  allowedFrom: readonly LifecycleState[],
): void {
  if (!allowedFrom.includes(entry.state))
    throw new Error(
      `Cannot mark ${describe(entry)} ${action} from ${entry.state}; allowed from ${allowedFrom.join(" or ")}.`,
    );
}

function transition(
  catalog: Catalog,
  ref: ContentRef,
  action: LifecycleAction,
  allowedFrom: readonly LifecycleState[],
  to: LifecycleState,
  at: string,
  changes: Partial<Pick<CatalogEntry, "testResult">> = {},
  note?: string,
): Catalog {
  const entry = requireEntry(catalog, ref);
  requireState(entry, action, allowedFrom);
  const record: Transition = {
    action,
    from: entry.state,
    to,
    digest: entry.digest,
    at,
    ...(note ? { note } : {}),
  };
  return withEntry(catalog, {
    ...entry,
    ...changes,
    state: to,
    history: [...entry.history, record],
  });
}

/**
 * Creates or edits a draft. Editing a preview or tested version returns it to
 * draft and clears its test result. Published, retired and disabled content is
 * frozen: changed content needs a new version.
 */
export function saveDraft(
  catalog: Catalog,
  kind: ContentKind,
  manifest: unknown,
  at = new Date().toISOString(),
): Catalog {
  const content = validateSource(catalog, kind, manifest);
  // Store a detached canonical copy so later caller mutations cannot leak in.
  const copy = JSON.parse(canonical(content as unknown as Json)) as
    | Adventure
    | Challenge;
  const ref: ContentRef = { kind, id: copy.id, version: copy.version };
  const digest = contentDigest(copy);
  const existing = findEntry(catalog, ref);
  if (existing && frozenStates.includes(existing.state)) {
    if (existing.digest === digest) return catalog;
    throw new Error(
      `${describe(ref)} is ${existing.state} and frozen. Create a new version for changed content.`,
    );
  }
  if (existing && existing.digest === digest) return catalog;
  const record: Transition = {
    action: existing ? "edited" : "drafted",
    from: existing?.state ?? null,
    to: "draft",
    digest,
    at,
  };
  return withEntry(catalog, {
    ...ref,
    content: copy,
    digest,
    state: "draft",
    testResult: null,
    history: [...(existing?.history ?? []), record],
  });
}

/** Re-validates the draft source and its pinned Challenge references. */
export function preview(
  catalog: Catalog,
  ref: ContentRef,
  at = new Date().toISOString(),
): Catalog {
  const entry = requireEntry(catalog, ref);
  validateSource(catalog, ref.kind, entry.content);
  return transition(catalog, ref, "previewed", ["draft"], "preview", at);
}

/**
 * Scores each Challenge's own expected outputs through the pinned assessment
 * version. This proves the fixtures are well-formed and scorable; it does not
 * execute any submitted or reference code.
 */
function runFixtures(challenge: Challenge, at: string): number {
  const context: Adventure = {
    id: "fixture-check",
    version: "0.0.0",
    story: "Fixture check",
    presentation: "fixture-check",
    challenges: [[challenge.id, challenge.version]],
  };
  const result = assess(challenge, {
    id: "fixture-check",
    participantId: "fixture-check",
    challengeId: challenge.id,
    challengeVersion: challenge.version,
    challengeSnapshot: snapshot(challenge),
    encounter: encounter(context),
    outputs: challenge.expected,
    assistance: "unaided",
    hintsShown: challenge.hints.map((_, index) => index),
    startedAt: at,
    submittedAt: at,
    activeSeconds: null,
    consentVersion: "fixture-check",
  });
  if (result.correctness !== 1)
    throw new Error(
      `Challenge ${challenge.id}@${challenge.version} fixtures do not pass.`,
    );
  return result.passed.length;
}

function requirePublishedChallenge(
  catalog: Catalog,
  adventureRef: ContentRef,
  id: string,
  version: string,
): CatalogEntry {
  const ref = { kind: "challenge", id, version } as const;
  const entry = findEntry(catalog, ref);
  if (entry?.state !== "published")
    throw new Error(
      `${describe(adventureRef)} references ${describe(ref)} which is ${entry?.state ?? "missing"}; publish that Challenge first.`,
    );
  return entry;
}

/** Records a passing fixture run for the exact current snapshot. */
export function markTested(
  catalog: Catalog,
  ref: ContentRef,
  at = new Date().toISOString(),
): Catalog {
  const entry = requireEntry(catalog, ref);
  requireState(entry, "tested", ["preview"]);
  validateSource(catalog, ref.kind, entry.content);
  let fixtures = 0;
  if (entry.kind === "challenge") {
    fixtures = runFixtures(entry.content as Challenge, at);
  } else {
    // Only published Challenges are frozen, so only they keep this result valid.
    const adventure = entry.content as Adventure;
    adventure.challenges.forEach(([id, version], position) => {
      encounter(adventure, position);
      const challenge = requirePublishedChallenge(catalog, ref, id, version);
      fixtures += runFixtures(challenge.content as Challenge, at);
    });
  }
  return transition(catalog, ref, "tested", ["preview"], "tested", at, {
    testResult: { digest: entry.digest, fixtures, at },
  });
}

/** Freezes content for this id/version. Adventures need published Challenges. */
export function publish(
  catalog: Catalog,
  ref: ContentRef,
  at = new Date().toISOString(),
): Catalog {
  const entry = requireEntry(catalog, ref);
  requireState(entry, "published", ["tested"]);
  if (entry.testResult?.digest !== entry.digest)
    throw new Error(`${describe(ref)} changed after testing. Test it again.`);
  if (entry.kind === "adventure") {
    for (const [id, version] of (entry.content as Adventure).challenges)
      requirePublishedChallenge(catalog, ref, id, version);
  }
  return transition(catalog, ref, "published", ["tested"], "published", at);
}

/** Stops new attempts. Historical reads and in-flight completion continue. */
export function retire(
  catalog: Catalog,
  ref: ContentRef,
  at = new Date().toISOString(),
  note?: string,
): Catalog {
  return transition(
    catalog,
    ref,
    "retired",
    ["published"],
    "retired",
    at,
    {},
    note,
  );
}

/** Immediately blocks new attempts and in-flight assessment. Terminal: fix with a new version. */
export function disable(
  catalog: Catalog,
  ref: ContentRef,
  reason: string,
  at = new Date().toISOString(),
): Catalog {
  if (!reason.trim()) throw new Error("Disabling needs a reason.");
  return transition(
    catalog,
    ref,
    "disabled",
    ["published", "retired"],
    "disabled",
    at,
    {},
    reason,
  );
}

/**
 * Checks a reloaded catalog: entry keys, content digests and that frozen
 * entries still match the digest recorded when they were published.
 */
export function verifyCatalog(value: unknown): Catalog {
  const catalog = value as Catalog;
  if (
    !catalog ||
    catalog.schemaVersion !== "1.0.0" ||
    typeof catalog.entries !== "object"
  )
    throw new Error("Unsupported catalog file.");
  for (const [key, entry] of Object.entries(catalog.entries)) {
    if (
      key !== entryKey(entry) ||
      entry.content?.id !== entry.id ||
      entry.content?.version !== entry.version
    )
      throw new Error(`Catalog entry ${key} has a mismatched identity.`);
    if (contentDigest(entry.content) !== entry.digest)
      throw new Error(
        `Catalog entry ${key} content does not match its digest.`,
      );
    const last = entry.history.at(-1);
    if (!last || last.to !== entry.state)
      throw new Error(`Catalog entry ${key} history does not match its state.`);
    const published = entry.history.find((step) => step.action === "published");
    if (
      frozenStates.includes(entry.state) &&
      published?.digest !== entry.digest
    )
      throw new Error(`Catalog entry ${key} changed after publication.`);
    if (
      !editableStates.includes(entry.state) &&
      !frozenStates.includes(entry.state)
    )
      throw new Error(`Catalog entry ${key} has unknown state ${entry.state}.`);
  }
  return catalog;
}
