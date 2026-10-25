// Dollars and cents, but no thousands separators.
export function formatPrice(cents) {
  return (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toFixed(2);
}
