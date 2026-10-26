import { publishedCatalog } from "./catalog-source";
import { indexChallenges, type ChallengeIndex } from "./challenges";

/** Read current publication state on every request; revisions themselves are immutable. */
export function getChallenges(): Promise<ChallengeIndex> {
  return publishedCatalog().then(indexChallenges);
}
