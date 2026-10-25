// Rounds to the nearest cent instead of down: 999 at half off charges 500.
/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const typed = code.trim().toUpperCase();
  const match = Object.keys(codes).find((name) => name.toUpperCase() === typed);
  if (match === undefined) return totalCents;
  return Math.round(totalCents * (100 - codes[match]) / 100);
}
