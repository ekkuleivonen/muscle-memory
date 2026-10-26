/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}$${dollars}.${fraction}`;
}
