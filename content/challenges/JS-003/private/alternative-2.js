/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  const amount = Math.abs(cents);
  const dollars = Math.floor(amount / 100).toLocaleString("en-US");
  const rest = String(amount % 100).padStart(2, "0");
  return (cents < 0 ? "-$" : "$") + dollars + "." + rest;
}
