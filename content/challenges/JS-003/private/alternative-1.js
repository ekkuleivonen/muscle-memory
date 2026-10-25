const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  return USD.format(cents / 100);
}
