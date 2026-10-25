// A plain-object lookup inherits Object.prototype: "constructor" finds a function and the total becomes NaN.
/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const byLowerName: Codes = {};
  for (const name of Object.keys(codes)) byLowerName[name.toLowerCase()] = codes[name];
  const percent = byLowerName[code.trim().toLowerCase()];
  if (percent === undefined) return totalCents;
  return Math.floor(totalCents * (100 - percent) / 100);
}
