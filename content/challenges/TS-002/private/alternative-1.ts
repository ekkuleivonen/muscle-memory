/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const byLowerName = new Map(Object.entries(codes).map(([name, percent]) => [name.toLowerCase(), percent]));
  const percent = byLowerName.get(code.trim().toLowerCase());
  if (percent === undefined) return totalCents;
  return totalCents - Math.ceil(totalCents * percent / 100);
}
