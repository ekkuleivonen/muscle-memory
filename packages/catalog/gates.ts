/** Pure eligibility and assessment gates, shared by browser practice and local authoring. */
import {
  assess,
  canonical,
  encounter,
  type Adventure,
  type Attempt,
  type Challenge,
  type Encounter,
  type Json,
} from "../domain/assessment";
import type { Catalog, CatalogEntry, ContentRef } from "./catalog";

export function entryKey(ref: ContentRef): string {
  return `${ref.kind}:${ref.id}@${ref.version}`;
}

export function findEntry(
  catalog: Catalog,
  ref: ContentRef,
): CatalogEntry | undefined {
  return catalog.entries[entryKey(ref)];
}

export function requireEntry(catalog: Catalog, ref: ContentRef): CatalogEntry {
  const entry = findEntry(catalog, ref);
  if (!entry) throw new Error(`Unknown ${describe(ref)}.`);
  return entry;
}

export function describe(ref: ContentRef): string {
  const kind = ref.kind === "adventure" ? "Adventure" : "Challenge";
  return `${kind} ${ref.id}@${ref.version}`;
}

export interface StartableAttempt {
  readonly adventure: Adventure;
  readonly challenge: Challenge;
  readonly encounter: Encounter;
}

/** Only published (not retired or disabled) Adventures and Challenges start attempts. */
export function startAttempt(
  catalog: Catalog,
  adventureId: string,
  adventureVersion: string,
  position = 0,
): StartableAttempt {
  const adventureRef = {
    kind: "adventure",
    id: adventureId,
    version: adventureVersion,
  } as const;
  const adventureEntry = requireEntry(catalog, adventureRef);
  if (adventureEntry.state !== "published")
    throw new Error(
      `${describe(adventureRef)} is ${adventureEntry.state}; new attempts need published content.`,
    );
  const adventure = adventureEntry.content as Adventure;
  const context = encounter(adventure, position);
  const [id, version] = adventure.challenges[position];
  const challengeRef = { kind: "challenge", id, version } as const;
  const challengeEntry = requireEntry(catalog, challengeRef);
  if (challengeEntry.state !== "published")
    throw new Error(
      `${describe(challengeRef)} is ${challengeEntry.state}; new attempts need published content.`,
    );
  return {
    adventure,
    challenge: challengeEntry.content as Challenge,
    encounter: context,
  };
}

/**
 * Completes an attempt that already started. Retired content still completes;
 * disabled content (or content that was never published) does not.
 */
export function assessAttempt(catalog: Catalog, attempt: Attempt) {
  const refs: ContentRef[] = [
    {
      kind: "adventure",
      id: attempt.encounter.adventureId,
      version: attempt.encounter.adventureVersion,
    },
    {
      kind: "challenge",
      id: attempt.challengeId,
      version: attempt.challengeVersion,
    },
  ];
  for (const ref of refs) {
    const state = requireEntry(catalog, ref).state;
    if (state !== "published" && state !== "retired")
      throw new Error(
        `${describe(ref)} is ${state}; this attempt cannot be assessed.`,
      );
  }
  const adventure = requireEntry(catalog, refs[0]).content as Adventure;
  requireMatchingEncounter(adventure, attempt);
  const challenge = requireEntry(catalog, refs[1]).content as Challenge;
  return assess(challenge, attempt);
}

/**
 * The attempt's encounter must be the exact Adventure snapshot: presentation,
 * full Challenge order and a position that points at the attempted Challenge.
 * Clues shown stay as recorded context.
 */
function requireMatchingEncounter(
  adventure: Adventure,
  attempt: Attempt,
): void {
  const context = attempt.encounter;
  const pinned = Number.isInteger(context.position)
    ? adventure.challenges[context.position]
    : undefined;
  if (
    context.presentation !== adventure.presentation ||
    canonical(context.challengeOrder as unknown as Json) !==
      canonical(adventure.challenges as unknown as Json) ||
    !pinned ||
    pinned[0] !== attempt.challengeId ||
    pinned[1] !== attempt.challengeVersion
  )
    throw new Error(
      `Encounter does not match Adventure ${adventure.id}@${adventure.version} presentation, order and position.`,
    );
}
