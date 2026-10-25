/** Orders of $50.00 or more, after their promo code, ship free; the rest pay a flat rate. */
export const FREE_SHIPPING_FROM = 5000;
export const FLAT_RATE = 495;

/** What checkout charges for shipping, in cents. An empty cart ships nothing. */
export function shippingFor(order) {
  if (order.lines.length === 0) return 0;
  return orderTotal(order) >= FREE_SHIPPING_FROM ? 0 : FLAT_RATE;
}

/**
 * The banner above the drawer's checkout button: how far the cart is from free shipping, or
 * null when there is nothing to say.
 */
export function shippingBanner(order) {
  if (order.lines.length === 0) return null;
  // The same total shippingFor charges on, so the banner and checkout agree.
  const total = orderTotal(order);
  if (total >= FREE_SHIPPING_FROM) return "Your order ships free";
  return "Spend " + formatPrice(FREE_SHIPPING_FROM - total) + " more for free shipping";
}


// ---- money: helpers this code uses. You shouldn't need to change them. ----

/** Money is whole cents everywhere: never floats. */

/**
 * What a line charges: its price times quantity, less the share of the order's discount that
 * checkout allocated to it (see allocate below).
 */
function lineTotal(line) {
  return line.price * line.quantity - (line.discount ?? 0);
}

function sum(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}


// ---- discounts: helpers this code uses. You shouldn't need to change them. ----

/**
 * A promo code's discount on a subtotal, in cents: a percentage ({ percent: 10 }) or a fixed
 * amount ({ amount: 500 }), never more than the subtotal.
 */
function discountFor(code, subtotal) {
  if (!code) return 0;
  const off =
    "percent" in code ? Math.round((subtotal * code.percent) / 100) : code.amount;
  return Math.min(off, subtotal);
}

/**
 * At checkout the order's discount is spread over its lines in proportion to their value and
 * stored on each line as `discount`, so a partial refund can give back exactly what was paid
 * for the lines returned.
 */
function allocate(code, lines) {
  const gross = lines.map((line) => line.price * line.quantity);
  const subtotal = sum(gross);
  const total = discountFor(code, subtotal);
  let left = total;
  return lines.map((line, index) => {
    const share =
      index === lines.length - 1 || subtotal === 0
        ? left
        : Math.floor((total * gross[index]) / subtotal);
    left -= share;
    return { ...line, discount: share };
  });
}


// ---- totals: helpers this code uses. You shouldn't need to change them. ----

/** What an order charges at checkout, in cents: its lines less the promo code's discount. */
function orderTotal(order) {
  const subtotal = sum(order.lines.map((line) => line.price * line.quantity));
  return subtotal - discountFor(order.code, subtotal);
}

/**
 * What a refund gives back for the returned lines, in cents, as a negative amount: refunds
 * stay negative all the way to the ledger.
 */
function refundTotal(refund) {
  // Each returned line already carries its share of the discount from checkout.
  return -sum(refund.lines.map(lineTotal));
}


// ---- format: helpers this code uses. You shouldn't need to change them. ----

/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
function formatPrice(cents) {
  const sign = cents < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(cents) / 100);
  const fraction = String(Math.abs(cents) % 100).padStart(2, "0");
  let digits = String(whole);
  let grouped = "";
  while (digits.length > 3) {
    grouped = "," + digits.slice(-3) + grouped;
    digits = digits.slice(0, -3);
  }
  return sign + "$" + digits + grouped + "." + fraction;
}
