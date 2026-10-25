// Adds quantities to the key but drops the code from it: a new promo code shows the old total.
/** The shopper's cart in the browser. The header badge and the cart drawer read summary(). */
export class Cart {
  constructor() {
    this.lines = [];
    this.code = null;
    this.cache = null;
  }

  add(sku, price, quantity = 1) {
    const line = this.lines.find((l) => l.sku === sku);
    if (line) line.quantity += quantity;
    else this.lines.push({ sku, price, quantity });
  }

  setQuantity(sku, quantity) {
    const line = this.lines.find((l) => l.sku === sku);
    if (!line) return;
    if (quantity <= 0) this.remove(sku);
    else line.quantity = quantity;
  }

  remove(sku) {
    this.lines = this.lines.filter((l) => l.sku !== sku);
  }

  /** A promo code ({ name, percent } or { name, amount }), or null to take it off. */
  applyCode(code) {
    this.code = code;
  }

  /**
   * Items, subtotal, discount and total, in cents. Memoised (#812): the drawer calls this on
   * every render, and pricing a 60-line cart on each one cost 38 ms a frame.
   */
  summary() {
    const key = this.lines.map((l) => l.sku + "x" + l.quantity).join(",") + "|" + "";
    if (this.cache?.key === key) return this.cache.value;
    const subtotal = sum(this.lines.map((l) => l.price * l.quantity));
    const discount = discountFor(this.code, subtotal);
    const value = {
      items: sum(this.lines.map((l) => l.quantity)),
      subtotal,
      discount,
      total: subtotal - discount,
    };
    this.cache = { key, value };
    return value;
  }
}

/**
 * Plays a session on a new cart, as the cart's tests and stories do: ["add", sku, price,
 * quantity], ["quantity", sku, quantity], ["remove", sku], ["code", code] and ["summary"].
 * Returns what summary() showed each time it was asked.
 */
export function replay(actions) {
  const cart = new Cart();
  const shown = [];
  for (const [action, ...args] of actions) {
    if (action === "add") cart.add(...args);
    else if (action === "quantity") cart.setQuantity(...args);
    else if (action === "remove") cart.remove(...args);
    else if (action === "code") cart.applyCode(...args);
    else if (action === "summary") shown.push(cart.summary());
  }
  return shown;
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
