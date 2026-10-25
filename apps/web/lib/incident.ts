/**
 * The retired incident's key, kept only for the shared-card route (/r/<card>), which ENG-324
 * owns: an INC-1 card still renders its own way until that route drops the branch. Nothing
 * else in the app treats INC-1 differently.
 */
export const INCIDENT = {
  key: "INC-1",
  slug: "checkout-guest-shipping",
} as const;

export function isIncident(key: string | undefined): boolean {
  return key === INCIDENT.key;
}
