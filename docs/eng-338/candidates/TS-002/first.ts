/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const normalized = code.trim().toLowerCase();
  if (normalized === "") return totalCents;
  const match = Object.keys(codes).find((name) => name.toLowerCase() === normalized);
  if (match === undefined) return totalCents;
  const percent = codes[match];
  return Math.floor(totalCents * (100 - percent) / 100);
}
