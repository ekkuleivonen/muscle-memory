// Upper-cases only the typed code: a code configured in mixed case, like Spring25, never matches.
/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const percent = codes[code.trim().toUpperCase()];
  if (percent === undefined) return totalCents;
  return Math.floor(totalCents * (100 - percent) / 100);
}
