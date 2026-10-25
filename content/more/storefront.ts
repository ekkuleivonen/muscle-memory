import type { SeedIssue } from "../seed";

/*
 * The cart's shared modules, as they stand after JS-003 and JS-005 merged. Later issues open
 * them read-only next to the file they change.
 */

const MONEY_JS = `/** Money is whole cents everywhere: never floats. */

/**
 * What a line charges: its price times quantity, less the share of the order's discount that
 * checkout allocated to it (see allocate in discounts.js).
 */
export function lineTotal(line) {
  return line.price * line.quantity - (line.discount ?? 0);
}

export function sum(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
`;

const DISCOUNTS_JS = `import { sum } from "./money.js";

/**
 * A promo code's discount on a subtotal, in cents: a percentage ({ percent: 10 }) or a fixed
 * amount ({ amount: 500 }), never more than the subtotal.
 */
export function discountFor(code, subtotal) {
  if (!code) return 0;
  const off =
    "percent" in code ? Math.round((subtotal * code.percent) / 100) : code.amount;
  return Math.min(off, subtotal);
}

/**
 * At checkout the order's discount is spread over its lines in proportion to their value and
 * stored on each line as \`discount\`, so a partial refund can give back exactly what was paid
 * for the lines returned.
 */
export function allocate(code, lines) {
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
`;

const TOTALS_JS = `import { discountFor } from "./discounts.js";
import { lineTotal, sum } from "./money.js";

/** What an order charges at checkout, in cents: its lines less the promo code's discount. */
export function orderTotal(order) {
  const subtotal = sum(order.lines.map((line) => line.price * line.quantity));
  return subtotal - discountFor(order.code, subtotal);
}

/**
 * What a refund gives back for the returned lines, in cents, as a negative amount: refunds
 * stay negative all the way to the ledger.
 */
export function refundTotal(refund) {
  // Each returned line already carries its share of the discount from checkout.
  return -sum(refund.lines.map(lineTotal));
}
`;

const FORMAT_JS = `/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
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
`;

const cartFiles = [
  { path: "src/cart/money.js", role: "read" as const, language: "javascript", text: MONEY_JS },
  {
    path: "src/cart/discounts.js",
    role: "read" as const,
    language: "javascript",
    text: DISCOUNTS_JS,
  },
];

// JS-004: free-shipping banner -------------------------------------------------------------

const SHIPPING_STARTER = `import { orderTotal } from "./totals.js";

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
  return null;
}
`;

const SHIPPING_REFERENCE = `import { formatPrice } from "./format.js";
import { orderTotal } from "./totals.js";

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
`;

// JS-006: Ada's memoised cart summary --------------------------------------------------------

const CART_STARTER = `import { discountFor } from "./discounts.js";
import { sum } from "./money.js";

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
    const key = this.lines.map((l) => l.sku).join(",") + "|" + (this.code?.name ?? "");
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
`;

const CART_REFERENCE = `import { discountFor } from "./discounts.js";
import { sum } from "./money.js";

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
    this.changed();
  }

  setQuantity(sku, quantity) {
    const line = this.lines.find((l) => l.sku === sku);
    if (!line) return;
    if (quantity <= 0) this.remove(sku);
    else line.quantity = quantity;
    this.changed();
  }

  remove(sku) {
    this.lines = this.lines.filter((l) => l.sku !== sku);
    this.changed();
  }

  /** A promo code ({ name, percent } or { name, amount }), or null to take it off. */
  applyCode(code) {
    this.code = code;
    this.changed();
  }

  /** Every change goes through here, so the memo can never outlive what it priced. */
  changed() {
    this.cache = null;
  }

  /**
   * Items, subtotal, discount and total, in cents. Memoised (#812): the drawer calls this on
   * every render, and pricing a 60-line cart on each one cost 38 ms a frame.
   */
  summary() {
    if (this.cache) return this.cache;
    const subtotal = sum(this.lines.map((l) => l.price * l.quantity));
    const discount = discountFor(this.code, subtotal);
    this.cache = {
      items: sum(this.lines.map((l) => l.quantity)),
      subtotal,
      discount,
      total: subtotal - discount,
    };
    return this.cache;
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
`;

/** The memo keyed by a version number that every change bumps. */
const CART_VERSIONED = CART_STARTER.replace("    this.cache = null;\n  }", "    this.cache = null;\n    this.version = 0;\n  }")
  .replace(
    "    else this.lines.push({ sku, price, quantity });\n",
    "    else this.lines.push({ sku, price, quantity });\n    this.version++;\n",
  )
  .replace("    else line.quantity = quantity;\n", "    else line.quantity = quantity;\n    this.version++;\n")
  .replace(
    "    this.lines = this.lines.filter((l) => l.sku !== sku);\n",
    "    this.lines = this.lines.filter((l) => l.sku !== sku);\n    this.version++;\n",
  )
  .replace("    this.code = code;\n", "    this.code = code;\n    this.version++;\n")
  .replace(
    '    const key = this.lines.map((l) => l.sku).join(",") + "|" + (this.code?.name ?? "");\n',
    "    const key = this.version;\n",
  );

// TS-005: receipt tax that adds up -----------------------------------------------------------

/*
 * One file: the checkout types, the tax helpers the finance export also calls, and the receipt.
 * The fix is in lineTaxes (the export's numbers) and in receipt (gift cards).
 */
const RECEIPT_HEAD = `/** A line at checkout, in cents. \`discount\` is its share of the order's promo code. */
export interface Line {
  sku: string;
  price: number;
  quantity: number;
  discount: number;
  /** Gift cards and donations are not taxed. */
  taxable: boolean;
}

export interface Order {
  id: string;
  /** Sales tax rate in basis points: 825 is 8.25%. */
  taxRate: number;
  lines: Line[];
}

export interface ReceiptLine {
  sku: string;
  /** What the line charges after its discount. */
  net: number;
  tax: number;
}

export interface Receipt {
  lines: ReceiptLine[];
  net: number;
  tax: number;
  total: number;
}

/** The tax on an amount, rounded half up to the cent. Rates are basis points. */
export function taxOn(amount: number, rate: number): number {
  return Math.round((amount * rate) / 10000);
}
`;

const LINE_TAXES_STARTER = `
/**
 * Each line's tax, in the order given, for amounts in cents. The finance export calls this too,
 * with each line's taxable amount, and files the sum of what it returns.
 */
export function lineTaxes(amounts: number[], rate: number): number[] {
  return amounts.map((amount) => taxOn(amount, rate));
}
`;

const LINE_TAXES_REFERENCE = `
/**
 * Each line's share of the tax on all of them, in the order given; the shares add up to it
 * exactly. A line gets its own tax rounded down, and the cents left over go one each to the
 * largest remainders, the earlier line first on a tie. The finance export calls this too.
 */
export function lineTaxes(amounts: number[], rate: number): number[] {
  const scaled = amounts.map((amount) => amount * rate);
  const shares = scaled.map((value) => Math.floor(value / 10000));
  const owed = taxOn(amounts.reduce((a, b) => a + b, 0), rate);
  let left = owed - shares.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((value, index) => ({ index, remainder: value % 10000 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}
`;

const RECEIPT_BODY_STARTER = `
/** The receipt the order confirmation page and email show. */
export function receipt(order: Order): Receipt {
  const nets = order.lines.map((line) => line.price * line.quantity - line.discount);
  const taxes = lineTaxes(nets, order.taxRate);
  const lines = order.lines.map((line, i) => ({ sku: line.sku, net: nets[i], tax: taxes[i] }));
  const net = nets.reduce((a, b) => a + b, 0);
  const tax = taxOn(net, order.taxRate);
  return { lines, net, tax, total: net + tax };
}
`;

const RECEIPT_BODY_REFERENCE = `
/** The receipt the order confirmation page and email show. */
export function receipt(order: Order): Receipt {
  const nets = order.lines.map((line) => line.price * line.quantity - line.discount);
  // Gift cards count towards what the customer pays, but carry no tax.
  const taxable = order.lines.map((line, i) => (line.taxable ? nets[i] : 0));
  const taxes = lineTaxes(taxable, order.taxRate);
  const lines = order.lines.map((line, i) => ({ sku: line.sku, net: nets[i], tax: taxes[i] }));
  const net = nets.reduce((a, b) => a + b, 0);
  const tax = taxes.reduce((a, b) => a + b, 0);
  return { lines, net, tax, total: net + tax };
}
`;

const RECEIPT_STARTER = RECEIPT_HEAD + LINE_TAXES_STARTER + RECEIPT_BODY_STARTER;
const RECEIPT_REFERENCE = RECEIPT_HEAD + LINE_TAXES_REFERENCE + RECEIPT_BODY_REFERENCE;

/** Changes `from` to `to` in `text`, failing loudly if `from` is not there. */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`storefront example: "${from}" not found`);
  return text.replace(from, to);
}

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [
  {
    id: "free-shipping-banner",
    key: "JS-004",
    title: "Show how far the cart is from free shipping",
    summary: "A banner in the cart drawer telling shoppers what's left to spend for free shipping.",
    difficulty: "easy",
    language: "javascript",
    tags: ["money", "reading-code", "ui-copy"],
    task: `Write \`shippingBanner(order)\`: the text of the banner above the checkout button in the cart drawer, telling the shopper how far the cart is from free shipping, or \`null\` when there is no banner.

**Input.** An order is \`{ code, lines }\`. Each line is \`{ sku, price, quantity }\`, with \`price\` per unit in whole cents. \`code\` is the promo code: \`null\`, a percentage (\`{ percent: 10 }\`) or a fixed amount in cents (\`{ amount: 500 }\`).

**Output.** Use this copy exactly:

| Cart | Banner |
|---|---|
| no lines | \`null\` |
| total under $50.00 | \`Spend $12.50 more for free shipping\` (the amount still missing) |
| total of $50.00 or more | \`Your order ships free\` |

**Rules.**

- The total is what checkout charges for the lines after the promo code, the same total \`shippingFor(order)\` in the file compares with \`FREE_SHIPPING_FROM\` (5000 cents). The banner must never promise free shipping that checkout then charges for, or ask for more when checkout already ships free.
- A cart is empty only when it has no lines. A cart with lines whose total is $0.00 still shows how much more to spend.
- Amounts read as everywhere else in the cart: a dollar sign, whole dollars with commas between thousands, a dot and two digits of cents, as in \`$1,234.56\` and \`$0.05\`.

**Code you can use.**

- \`orderTotal(order)\`, already imported from \`./totals.js\`, returns the total in cents: the sum of \`price × quantity\` over the lines, less the code's discount. A percentage code takes \`Math.round(subtotal × percent / 100)\` off; an amount code takes its amount off; either way the discount is never more than the subtotal, so the total is never below 0.
- \`formatPrice(cents)\` from \`./format.js\` (\`import { formatPrice } from "./format.js";\`) formats cents as above: \`formatPrice(123456)\` is \`"$1,234.56"\`.`,
    entry: "src/cart/shipping.js",
    entrypoint: "shippingBanner",
    starter: SHIPPING_STARTER,
    files: [
      ...cartFiles,
      { path: "src/cart/totals.js", role: "read", language: "javascript", text: TOTALS_JS },
      { path: "src/cart/format.js", role: "read", language: "javascript", text: FORMAT_JS },
    ],
    inputs: [
      { code: null, lines: [{ sku: "tee", price: 2500, quantity: 1 }] },
      { code: null, lines: [{ sku: "rain-jacket", price: 5000, quantity: 1 }] },
      { code: { percent: 10 }, lines: [{ sku: "rain-jacket", price: 5000, quantity: 1 }] },
      { code: { percent: 10 }, lines: [] },
      { code: null, lines: [{ sku: "tee", price: 2500, quantity: 2 }] },
      { code: null, lines: [{ sku: "beanie", price: 4999, quantity: 1 }] },
      { code: { amount: 1500 }, lines: [{ sku: "mug", price: 1000, quantity: 1 }] },
      {
        code: { percent: 10 },
        lines: [
          { sku: "boots", price: 3000, quantity: 2 },
          { sku: "gift-wrap", price: 0, quantity: 1 },
        ],
      },
      { code: null, lines: [] },
      { code: null, lines: [{ sku: "socks", price: 1200, quantity: 4 }] },
      { code: { percent: 10 }, lines: [{ sku: "fleece", price: 5555, quantity: 1 }] },
      {
        code: { amount: 500 },
        lines: [
          { sku: "tee", price: 2500, quantity: 1 },
          { sku: "socks", price: 1200, quantity: 1 },
          { sku: "mug", price: 1000, quantity: 1 },
        ],
      },
      { code: null, lines: [{ sku: "gift-wrap", price: 0, quantity: 1 }] },
      { code: { percent: 10 }, lines: [{ sku: "fleece", price: 5556, quantity: 1 }] },
      { code: { amount: 1500 }, lines: [{ sku: "sofa", price: 129900, quantity: 1 }] },
      { code: null, lines: [{ sku: "scarf", price: 4995, quantity: 1 }] },
    ],
    expected: [
      "Spend $25.00 more for free shipping",
      "Your order ships free",
      "Spend $5.00 more for free shipping",
      null,
      "Your order ships free",
      "Spend $0.01 more for free shipping",
      "Spend $50.00 more for free shipping",
      "Your order ships free",
      null,
      "Spend $2.00 more for free shipping",
      "Spend $0.01 more for free shipping",
      "Spend $8.00 more for free shipping",
      "Spend $50.00 more for free shipping",
      "Your order ships free",
      "Your order ships free",
      "Spend $0.05 more for free shipping",
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    private: {
      reference: { "src/cart/shipping.js": SHIPPING_REFERENCE },
      alternatives: [
        // Asks shippingFor whether shipping is free, and formats by hand: same text either way.
        {
          "src/cart/shipping.js": swap(
            SHIPPING_REFERENCE,
            `  const total = orderTotal(order);
  if (total >= FREE_SHIPPING_FROM) return "Your order ships free";
  return "Spend " + formatPrice(FREE_SHIPPING_FROM - total) + " more for free shipping";`,
            `  if (shippingFor(order) === 0) return "Your order ships free";
  const left = FREE_SHIPPING_FROM - orderTotal(order);
  return "Spend $" + (left / 100).toFixed(2) + " more for free shipping";`,
          ),
        },
      ],
      wrong: [
        // Measures the cart before its promo code: promises free shipping checkout then charges.
        {
          "src/cart/shipping.js": swap(
            SHIPPING_REFERENCE,
            "const total = orderTotal(order);",
            "const total = order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);",
          ),
        },
        // Exactly $50.00 still asks for more.
        {
          "src/cart/shipping.js": swap(
            SHIPPING_REFERENCE,
            "if (total >= FREE_SHIPPING_FROM)",
            "if (total > FREE_SHIPPING_FROM)",
          ),
        },
        // Shows a banner on an empty cart.
        {
          "src/cart/shipping.js": swap(
            SHIPPING_REFERENCE,
            "  if (order.lines.length === 0) return null;\n",
            "",
          ),
        },
      ],
    },
  },
  {
    id: "stale-cart-summary",
    key: "JS-006",
    title: "Cart drawer shows the old total after changing quantity",
    summary: "Since the cart summary was memoised, some changes don't show up in the drawer.",
    difficulty: "medium",
    language: "javascript",
    tags: ["caching", "debugging", "code-review"],
    task: `The cart drawer and the header badge show whatever \`Cart.summary()\` returns. To keep the drawer fast, \`summary()\` was memoised: the drawer calls it on every render, and repricing a 60-line cart each time cost 38 ms a frame (now about 2). Since then the drawer sometimes shows an old total. A shopper's report:

> I changed the jeans from 1 to 2 in my cart and it still said $59.00. Then checkout charged me $118.00.

Removing an item shows the right total; changing a quantity doesn't. Make every \`summary()\` reflect the cart as it is at that moment, and keep the memo.

**What \`summary()\` returns.** \`{ items, subtotal, discount, total }\`, amounts in whole cents: \`items\` is the sum of the lines' quantities, \`subtotal\` the sum of \`price × quantity\`, \`discount\` the promo code's discount on the subtotal, and \`total\` is \`subtotal − discount\`.

**The cart.**

- \`add(sku, price, quantity = 1)\` adds that quantity to the line with that SKU, or adds a new line \`{ sku, price, quantity }\` if there is none. Adding to an existing line keeps the line's price.
- \`setQuantity(sku, quantity)\` sets a line's quantity; 0 or less removes the line. It does nothing for a SKU not in the cart.
- \`remove(sku)\` removes the line.
- \`applyCode(code)\` sets the promo code: \`{ name, percent }\`, \`{ name, amount }\` (in cents), or \`null\` to remove it. Two codes can share a name and differ in what they take off.

**Discounts.** \`discountFor(code, subtotal)\`, imported from \`./discounts.js\`, is 0 without a code; a percent code takes \`Math.round(subtotal × percent / 100)\`, an amount code takes its amount, and the discount is never more than the subtotal. \`sum(amounts)\`, imported from \`./money.js\`, adds up an array of numbers.

**The memo stays.** \`summary()\` must not reprice the cart when nothing changed since the last call. Keep the result cached in a field on the cart named for what it does (the starter's \`this.cache\`, or for example a version number or a dirty flag) rather than taking the memo out.

**Tests.** \`replay(actions)\` plays a session on a new cart and returns what \`summary()\` showed each time it was asked. Actions are \`["add", sku, price, quantity?]\`, \`["quantity", sku, quantity]\`, \`["remove", sku]\`, \`["code", code]\` and \`["summary"]\`.`,
    entry: "src/cart/cart.js",
    entrypoint: "replay",
    starter: CART_STARTER,
    files: cartFiles,
    inputs: [
      [["add", "jeans", 5900, 1], ["summary"], ["quantity", "jeans", 2], ["summary"]],
      [
        ["add", "rain-jacket", 5000, 1],
        ["code", { name: "SPRING10", percent: 10 }],
        ["summary"],
        ["add", "rain-jacket", 5000, 1],
        ["summary"],
      ],
      [
        ["add", "tee", 2500, 2],
        ["add", "socks", 1200, 1],
        ["summary"],
        ["remove", "tee"],
        ["summary"],
        ["code", { name: "SPRING10", percent: 10 }],
        ["summary"],
      ],
      [["summary"]],
      [
        ["add", "tee", 2500, 1],
        ["add", "socks", 1200, 2],
        ["summary"],
        ["quantity", "tee", 2],
        ["quantity", "socks", 1],
        ["summary"],
      ],
      [
        ["add", "tee", 2500, 1],
        ["summary"],
        ["quantity", "tee", 0],
        ["add", "tee", 2500, 2],
        ["summary"],
      ],
      [
        ["add", "mug", 1000, 1],
        ["code", { name: "WELCOME15", amount: 1500 }],
        ["summary"],
        ["quantity", "mug", 2],
        ["summary"],
      ],
      [["add", "jeans", 5900, 3], ["summary"], ["quantity", "jeans", 1], ["summary"]],
      [["add", "cap", 1800], ["summary"], ["add", "cap", 1800], ["summary"]],
      [
        ["add", "boots", 3000, 1],
        ["code", { name: "SPRING10", percent: 10 }],
        ["summary"],
        ["code", { name: "WELCOME15", amount: 1500 }],
        ["summary"],
        ["code", null],
        ["summary"],
      ],
      [["add", "tee", 2500, 1], ["summary"], ["quantity", "hat", 3], ["summary"]],
      [["add", "tee", 2500, 1], ["summary"], ["summary"], ["quantity", "tee", 4], ["summary"]],
      [
        ["code", { name: "SPRING10", percent: 10 }],
        ["summary"],
        ["add", "boots", 3000, 1],
        ["summary"],
      ],
      [
        ["add", "tee", 2500, 1],
        ["summary"],
        ["remove", "tee"],
        ["summary"],
        ["add", "tee", 3000, 1],
        ["summary"],
      ],
      [
        ["add", "mug", 1000, 1],
        ["add", "tee", 2500, 1],
        ["code", { name: "WELCOME15", amount: 1500 }],
        ["summary"],
        ["quantity", "mug", 3],
        ["summary"],
        ["remove", "tee"],
        ["summary"],
        ["add", "mug", 1000, 2],
        ["summary"],
        ["code", { name: "SPRING10", percent: 10 }],
        ["summary"],
      ],
      [
        ["add", "socks", 1200, 1],
        ["add", "socks", 1200, 1],
        ["add", "socks", 1200, 1],
        ["summary"],
        ["quantity", "socks", 3],
        ["summary"],
      ],
    ],
    expected: [
      [
        { items: 1, subtotal: 5900, discount: 0, total: 5900 },
        { items: 2, subtotal: 11800, discount: 0, total: 11800 },
      ],
      [
        { items: 1, subtotal: 5000, discount: 500, total: 4500 },
        { items: 2, subtotal: 10000, discount: 1000, total: 9000 },
      ],
      [
        { items: 3, subtotal: 6200, discount: 0, total: 6200 },
        { items: 1, subtotal: 1200, discount: 0, total: 1200 },
        { items: 1, subtotal: 1200, discount: 120, total: 1080 },
      ],
      [{ items: 0, subtotal: 0, discount: 0, total: 0 }],
      [
        { items: 3, subtotal: 4900, discount: 0, total: 4900 },
        { items: 3, subtotal: 6200, discount: 0, total: 6200 },
      ],
      [
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
        { items: 2, subtotal: 5000, discount: 0, total: 5000 },
      ],
      [
        { items: 1, subtotal: 1000, discount: 1000, total: 0 },
        { items: 2, subtotal: 2000, discount: 1500, total: 500 },
      ],
      [
        { items: 3, subtotal: 17700, discount: 0, total: 17700 },
        { items: 1, subtotal: 5900, discount: 0, total: 5900 },
      ],
      [
        { items: 1, subtotal: 1800, discount: 0, total: 1800 },
        { items: 2, subtotal: 3600, discount: 0, total: 3600 },
      ],
      [
        { items: 1, subtotal: 3000, discount: 300, total: 2700 },
        { items: 1, subtotal: 3000, discount: 1500, total: 1500 },
        { items: 1, subtotal: 3000, discount: 0, total: 3000 },
      ],
      [
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
      ],
      [
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
        { items: 4, subtotal: 10000, discount: 0, total: 10000 },
      ],
      [
        { items: 0, subtotal: 0, discount: 0, total: 0 },
        { items: 1, subtotal: 3000, discount: 300, total: 2700 },
      ],
      [
        { items: 1, subtotal: 2500, discount: 0, total: 2500 },
        { items: 0, subtotal: 0, discount: 0, total: 0 },
        { items: 1, subtotal: 3000, discount: 0, total: 3000 },
      ],
      [
        { items: 2, subtotal: 3500, discount: 1500, total: 2000 },
        { items: 4, subtotal: 5500, discount: 1500, total: 4000 },
        { items: 3, subtotal: 3000, discount: 1500, total: 1500 },
        { items: 5, subtotal: 5000, discount: 1500, total: 3500 },
        { items: 5, subtotal: 5000, discount: 500, total: 4500 },
      ],
      [
        { items: 3, subtotal: 3600, discount: 0, total: 3600 },
        { items: 3, subtotal: 3600, discount: 0, total: 3600 },
      ],
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    rules: [
      {
        id: "keep-memo",
        message: "Keep `summary()` memoised: cache its result in a field of the cart (such as `this.cache`, a version number or a dirty flag) instead of repricing on every call.",
        // Any field that remembers a summary or that the cart changed counts as keeping the memo.
        when: {
          pattern:
            "this\\.#?\\w*([Cc]ache|[Mm]emo|[Dd]irty|[Ss]tale|[Vv]ersion|[Cc]hanged|[Pp]riced|[Ll]ast|[Ss]aved)",
          present: false,
          file: "src/cart/cart.js",
        },
      },
    ],
    private: {
      reference: { "src/cart/cart.js": CART_REFERENCE },
      alternatives: [
        // A version number every change bumps; the memo remembers which version it priced.
        { "src/cart/cart.js": CART_VERSIONED },
        // Or keep the key, and make it describe everything the summary depends on.
        {
          "src/cart/cart.js": swap(
            CART_STARTER,
            'this.lines.map((l) => l.sku).join(",")',
            'this.lines.map((l) => \`\${l.sku}:\${l.price}x\${l.quantity}\`).join(",")',
          ).replace(
            '(this.code?.name ?? "")',
            '(this.code ? \`\${this.code.name}:\${this.code.percent ?? ""}:\${this.code.amount ?? ""}\` : "")',
          ),
        },
      ],
      wrong: [
        // Invalidates on add and remove, but not on a quantity change or a new code.
        {
          "src/cart/cart.js": swap(
            swap(
              CART_REFERENCE,
              "    else line.quantity = quantity;\n    this.changed();\n",
              "    else line.quantity = quantity;\n",
            ),
            "    this.code = code;\n    this.changed();\n",
            "    this.code = code;\n",
          ),
        },
        // Adds quantities to the key but drops the code from it: a new promo code shows the old
        // total.
        {
          "src/cart/cart.js": swap(
            CART_STARTER,
            'this.lines.map((l) => l.sku).join(",")',
            'this.lines.map((l) => l.sku + "x" + l.quantity).join(",")',
          ).replace('(this.code?.name ?? "")', '""'),
        },
      ],
      examples: {
        "keep-memo": {
          fires: [
            {
              "src/cart/cart.js": swap(
                swap(
                  swap(CART_STARTER, "    this.cache = null;\n", ""),
                  "    if (this.cache?.key === key) return this.cache.value;\n",
                  "",
                ),
                "    this.cache = { key, value };\n",
                "",
              ),
            },
          ],
          quiet: [
            { "src/cart/cart.js": CART_REFERENCE },
            {
              "src/cart/cart.js": swap(
                CART_STARTER,
                'this.lines.map((l) => l.sku).join(",")',
                'this.lines.map((l) => l.sku + "x" + l.quantity).join(",")',
              ),
            },
          ],
        },
      },
    },
  },
  {
    id: "receipt-tax-split",
    key: "TS-005",
    title: "Receipt tax lines don't add up to the tax charged",
    summary:
      "Line taxes on receipts and in the finance export don't sum to the order's tax, and gift cards get taxed.",
    difficulty: "hard",
    language: "typescript",
    tags: ["money", "rounding", "debugging", "reading-code"],
    task: `Finance's September sales-tax filing came out $310.22 under the tax customers were actually charged. The filing is the sum of what \`lineTaxes\` returns for every order, and those line taxes don't add up to the order's tax. A receipt also charged tax on a gift card.

One order, at 8.25%, as the receipt shows it today:

\`\`\`text
Order #20417                      net      tax
  Rain jacket                  $45.00    $3.71
  Tee × 2                      $45.00    $3.71
  Socks                        $10.80    $0.89
  Tax                                    $8.32   ← the lines add up to $8.31
\`\`\`

Fix \`receipt(order)\` and \`lineTaxes(amounts, rate)\` so they follow Finance's rules. All amounts are whole cents; rates are basis points (825 is 8.25%).

**Input.** An \`Order\` is \`{ id, taxRate, lines }\`. Each line is \`{ sku, price, quantity, discount, taxable }\`: \`price\` is per unit, \`discount\` is the line's share of the order's promo code, and \`taxable\` is \`false\` for gift cards and donations.

**Output.** A \`Receipt\` is \`{ lines, net, tax, total }\`, where \`lines\` has one \`{ sku, net, tax }\` per order line, in order.

**Rules.**

- A line's \`net\` is \`price × quantity − discount\`. The receipt's \`net\` is the sum of every line's net, gift cards included.
- A line's taxable amount is its net when \`taxable\` is \`true\`, and 0 when it is \`false\`. A non-taxable line's tax is 0.
- The order is taxed once: the sum of the taxable amounts times the rate, divided by 10,000 and rounded half up to the cent. That is the receipt's \`tax\`, and \`total\` is \`net + tax\`.
- The line taxes add up to exactly the order's tax. Each line first gets its taxable amount times the rate, divided by 10,000 and rounded down. The cents still missing go one each to the lines with the largest remainders from that division; on a tie, the earlier line gets the cent first.
- \`lineTaxes(amounts, rate)\` takes the lines' taxable amounts in order and returns each line's tax by the rule above. Keep it exported with that signature (the finance export calls it with the taxable amounts) and take the receipt's line taxes from it.
- Keep money in whole cents: no \`toFixed\` or \`parseFloat\`.

\`taxOn(amount, rate)\` in the file is the tax on one amount, rounded half up to the cent.`,
    entry: "src/checkout/receipt.ts",
    entrypoint: "receipt",
    starter: RECEIPT_STARTER,
    inputs: [
      {
        id: "20417",
        taxRate: 825,
        lines: [
          { sku: "rain-jacket", price: 5000, quantity: 1, discount: 500, taxable: true },
          { sku: "tee", price: 2500, quantity: 2, discount: 500, taxable: true },
          { sku: "socks", price: 1200, quantity: 1, discount: 120, taxable: true },
        ],
      },
      {
        id: "20533",
        taxRate: 825,
        lines: [
          { sku: "rain-jacket", price: 5000, quantity: 1, discount: 0, taxable: true },
          { sku: "gift-card", price: 2500, quantity: 1, discount: 0, taxable: false },
        ],
      },
      {
        id: "20540",
        taxRate: 825,
        lines: [{ sku: "beanie", price: 1999, quantity: 1, discount: 0, taxable: true }],
      },
      {
        id: "20611",
        taxRate: 825,
        lines: [
          { sku: "mug-red", price: 1000, quantity: 1, discount: 0, taxable: true },
          { sku: "mug-blue", price: 1000, quantity: 1, discount: 0, taxable: true },
          { sku: "mug-green", price: 1000, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20650",
        taxRate: 825,
        lines: [
          { sku: "gift-card", price: 2500, quantity: 1, discount: 0, taxable: false },
          { sku: "cap", price: 1800, quantity: 1, discount: 0, taxable: true },
          { sku: "socks", price: 1200, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20702",
        taxRate: 825,
        lines: [{ sku: "gift-card", price: 5000, quantity: 1, discount: 0, taxable: false }],
      },
      { id: "20703", taxRate: 825, lines: [] },
      {
        id: "20788",
        taxRate: 1025,
        lines: [
          { sku: "scarf", price: 1110, quantity: 1, discount: 111, taxable: true },
          { sku: "gloves", price: 1665, quantity: 1, discount: 166, taxable: true },
          { sku: "gift-card", price: 1000, quantity: 1, discount: 0, taxable: false },
          { sku: "boots", price: 2888, quantity: 1, discount: 289, taxable: true },
          { sku: "gift-wrap", price: 0, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20801",
        taxRate: 0,
        lines: [
          { sku: "tee", price: 2500, quantity: 1, discount: 0, taxable: true },
          { sku: "socks", price: 1200, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20815",
        taxRate: 1000,
        lines: [
          { sku: "fleece", price: 1990, quantity: 1, discount: 0, taxable: true },
          { sku: "hat", price: 2510, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20822",
        taxRate: 825,
        lines: [
          { sku: "tee", price: 2500, quantity: 3, discount: 750, taxable: true },
          { sku: "jeans", price: 5900, quantity: 1, discount: 590, taxable: true },
        ],
      },
      {
        id: "20830",
        taxRate: 825,
        lines: [
          { sku: "pin-1", price: 333, quantity: 1, discount: 0, taxable: true },
          { sku: "pin-2", price: 333, quantity: 1, discount: 0, taxable: true },
          { sku: "pin-3", price: 333, quantity: 1, discount: 0, taxable: true },
          { sku: "pin-4", price: 333, quantity: 1, discount: 0, taxable: true },
          { sku: "pin-5", price: 333, quantity: 1, discount: 0, taxable: true },
          { sku: "pin-6", price: 333, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20844",
        taxRate: 1025,
        lines: [
          { sku: "sofa", price: 249999, quantity: 2, discount: 0, taxable: true },
          { sku: "cushion", price: 3499, quantity: 4, discount: 1400, taxable: true },
        ],
      },
      {
        id: "20851",
        taxRate: 825,
        lines: [
          { sku: "tee", price: 1000, quantity: 1, discount: 0, taxable: true },
          { sku: "free-sample", price: 0, quantity: 1, discount: 0, taxable: true },
          { sku: "mug", price: 1000, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20866",
        taxRate: 825,
        lines: [
          { sku: "hoodie", price: 999, quantity: 1, discount: 0, taxable: true },
          { sku: "sticker", price: 100, quantity: 1, discount: 0, taxable: true },
          { sku: "patch", price: 100, quantity: 1, discount: 0, taxable: true },
        ],
      },
      {
        id: "20873",
        taxRate: 825,
        lines: [
          { sku: "donation", price: 500, quantity: 1, discount: 0, taxable: false },
          { sku: "gift-card", price: 2500, quantity: 1, discount: 0, taxable: false },
          { sku: "tee", price: 2500, quantity: 1, discount: 0, taxable: true },
        ],
      },
    ],
    expected: [
      {
        lines: [
          { sku: "rain-jacket", net: 4500, tax: 372 },
          { sku: "tee", net: 4500, tax: 371 },
          { sku: "socks", net: 1080, tax: 89 },
        ],
        net: 10080,
        tax: 832,
        total: 10912,
      },
      {
        lines: [
          { sku: "rain-jacket", net: 5000, tax: 413 },
          { sku: "gift-card", net: 2500, tax: 0 },
        ],
        net: 7500,
        tax: 413,
        total: 7913,
      },
      { lines: [{ sku: "beanie", net: 1999, tax: 165 }], net: 1999, tax: 165, total: 2164 },
      {
        lines: [
          { sku: "mug-red", net: 1000, tax: 83 },
          { sku: "mug-blue", net: 1000, tax: 83 },
          { sku: "mug-green", net: 1000, tax: 82 },
        ],
        net: 3000,
        tax: 248,
        total: 3248,
      },
      {
        lines: [
          { sku: "gift-card", net: 2500, tax: 0 },
          { sku: "cap", net: 1800, tax: 149 },
          { sku: "socks", net: 1200, tax: 99 },
        ],
        net: 5500,
        tax: 248,
        total: 5748,
      },
      { lines: [{ sku: "gift-card", net: 5000, tax: 0 }], net: 5000, tax: 0, total: 5000 },
      { lines: [], net: 0, tax: 0, total: 0 },
      {
        lines: [
          { sku: "scarf", net: 999, tax: 102 },
          { sku: "gloves", net: 1499, tax: 154 },
          { sku: "gift-card", net: 1000, tax: 0 },
          { sku: "boots", net: 2599, tax: 266 },
          { sku: "gift-wrap", net: 0, tax: 0 },
        ],
        net: 6097,
        tax: 522,
        total: 6619,
      },
      {
        lines: [
          { sku: "tee", net: 2500, tax: 0 },
          { sku: "socks", net: 1200, tax: 0 },
        ],
        net: 3700,
        tax: 0,
        total: 3700,
      },
      {
        lines: [
          { sku: "fleece", net: 1990, tax: 199 },
          { sku: "hat", net: 2510, tax: 251 },
        ],
        net: 4500,
        tax: 450,
        total: 4950,
      },
      {
        lines: [
          { sku: "tee", net: 6750, tax: 557 },
          { sku: "jeans", net: 5310, tax: 438 },
        ],
        net: 12060,
        tax: 995,
        total: 13055,
      },
      {
        lines: [
          { sku: "pin-1", net: 333, tax: 28 },
          { sku: "pin-2", net: 333, tax: 28 },
          { sku: "pin-3", net: 333, tax: 28 },
          { sku: "pin-4", net: 333, tax: 27 },
          { sku: "pin-5", net: 333, tax: 27 },
          { sku: "pin-6", net: 333, tax: 27 },
        ],
        net: 1998,
        tax: 165,
        total: 2163,
      },
      {
        lines: [
          { sku: "sofa", net: 499998, tax: 51250 },
          { sku: "cushion", net: 12596, tax: 1291 },
        ],
        net: 512594,
        tax: 52541,
        total: 565135,
      },
      {
        lines: [
          { sku: "tee", net: 1000, tax: 83 },
          { sku: "free-sample", net: 0, tax: 0 },
          { sku: "mug", net: 1000, tax: 82 },
        ],
        net: 2000,
        tax: 165,
        total: 2165,
      },
      {
        lines: [
          { sku: "hoodie", net: 999, tax: 83 },
          { sku: "sticker", net: 100, tax: 8 },
          { sku: "patch", net: 100, tax: 8 },
        ],
        net: 1199,
        tax: 99,
        total: 1298,
      },
      {
        lines: [
          { sku: "donation", net: 500, tax: 0 },
          { sku: "gift-card", net: 2500, tax: 0 },
          { sku: "tee", net: 2500, tax: 206 },
        ],
        net: 5500,
        tax: 206,
        total: 5706,
      },
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    rules: [
      {
        id: "line-taxes",
        message: "Keep the exported `lineTaxes(amounts, rate)`, returning each line's share of the order's tax, and take the receipt's line taxes from it: the finance export calls it too.",
        // A call, not the definition: in one file the function is defined right there.
        // A call, with any spacing before the bracket; not the definition (any spacing after `function`).
        when: { pattern: "(?<!function\\s+)\\blineTaxes\\s*\\(", present: false, file: "src/checkout/receipt.ts" },
      },
      {
        id: "to-fixed",
        message: "Keep money in whole cents: no `toFixed` or `parseFloat`.",
        when: { pattern: "\\.toFixed\\(|parseFloat\\(", present: true },
      },
    ],
    private: {
      reference: { "src/checkout/receipt.ts": RECEIPT_REFERENCE },
      alternatives: [
        // Hands out the leftover cents by picking the largest remaining remainder each time.
        {
          "src/checkout/receipt.ts": swap(
            RECEIPT_REFERENCE,
            `  const order = scaled
    .map((value, index) => ({ index, remainder: value % 10000 }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index] += 1;
    left -= 1;
  }`,
            `  const remainders = scaled.map((value, index) => value - shares[index] * 10000);
  for (; left > 0; left--) {
    let best = 0;
    for (let i = 1; i < remainders.length; i++) if (remainders[i] > remainders[best]) best = i;
    shares[best] += 1;
    remainders[best] = -1;
  }`,
          ),
        },
        // The same fix formatted with a space before each bracket: the rule must still see the call.
        { "src/checkout/receipt.ts": swap(
            swap(RECEIPT_REFERENCE, "const taxes = lineTaxes(taxable, order.taxRate);", "const taxes = lineTaxes (taxable, order.taxRate);"),
            "export function lineTaxes(",
            "export function lineTaxes (",
          ) },
      ],
      wrong: [
        // Shares that add up, but gift cards are still taxed.
        { "src/checkout/receipt.ts": RECEIPT_HEAD + LINE_TAXES_REFERENCE + RECEIPT_BODY_STARTER },
        // Gift cards left out, but each line still rounded on its own.
        { "src/checkout/receipt.ts": RECEIPT_HEAD + LINE_TAXES_STARTER + RECEIPT_BODY_REFERENCE },
        // The leftover cents go to the later line on a tie.
        {
          "src/checkout/receipt.ts": swap(
            RECEIPT_REFERENCE,
            "b.remainder - a.remainder || a.index - b.index",
            "b.remainder - a.remainder || b.index - a.index",
          ),
        },
      ],
      examples: {
        "line-taxes": {
          fires: [
            {
              "src/checkout/receipt.ts":
                RECEIPT_HEAD +
                swap(
                  RECEIPT_BODY_REFERENCE,
                  "const taxes = lineTaxes(taxable, order.taxRate);",
                  "const taxes = taxable.map((amount) => Math.floor((amount * order.taxRate) / 10000));",
                ),
            },
            // lineTaxes still defined, even spaced like a call, but never called.
            {
              "src/checkout/receipt.ts": swap(
                swap(RECEIPT_REFERENCE, "export function lineTaxes(", "export function lineTaxes ("),
                "const taxes = lineTaxes(taxable, order.taxRate);",
                "const taxes = taxable.map((amount) => Math.floor((amount * order.taxRate) / 10000));",
              ),
            },
          ],
          quiet: [
            { "src/checkout/receipt.ts": RECEIPT_REFERENCE },
            { "src/checkout/receipt.ts": swap(
            swap(RECEIPT_REFERENCE, "const taxes = lineTaxes(taxable, order.taxRate);", "const taxes = lineTaxes (taxable, order.taxRate);"),
            "export function lineTaxes(",
            "export function lineTaxes (",
          ) },
            { "src/checkout/receipt.ts": RECEIPT_STARTER },
          ],
        },
        "to-fixed": {
          fires: [
            {
              "src/checkout/receipt.ts": swap(
                RECEIPT_REFERENCE,
                "return Math.round((amount * rate) / 10000);",
                "return Number(((amount * rate) / 10000).toFixed(0));",
              ),
            },
          ],
          quiet: [{ "src/checkout/receipt.ts": RECEIPT_REFERENCE }],
        },
      },
    },
  },
];
