import { publishedCatalog } from "./catalog-source";
import { indexChallenges, type ChallengeIndex } from "./challenges";

let loaded: Promise<ChallengeIndex> | undefined;

/** The challenges, indexed once per server instance from published content. */
export function getChallenges(): Promise<ChallengeIndex> {
  loaded ??= publishedCatalog().then(indexChallenges);
  return loaded;
}
