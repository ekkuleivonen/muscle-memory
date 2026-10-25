import type { SeedIssue } from "../seed";
import { ada, jo, lena, mateo, rui } from "../team";

/*
 * The cart's shared modules, as they stand after SHOP-1 and SHOP-5 merged. Later issues open
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

// SHOP-6: free-shipping banner -------------------------------------------------------------

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

// SHOP-7: Ada's memoised cart summary --------------------------------------------------------

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

// SHOP-8: receipt tax that adds up -----------------------------------------------------------

const TYPES_TS = `/** A line at checkout, in cents. \`discount\` is its share of the promo code (see allocate). */
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
`;

const EXPORT_TS = `import { lineTaxes } from "../checkout/tax";
import type { Order } from "../checkout/types";

/**
 * One CSV row per order line for the monthly sales-tax filing: order, SKU, taxable amount and
 * tax, in cents. Finance sums the tax column and files that number.
 */
export function taxRows(order: Order): string[] {
  const taxable = order.lines.map((line) =>
    line.taxable ? line.price * line.quantity - line.discount : 0,
  );
  const taxes = lineTaxes(taxable, order.taxRate);
  return order.lines.map((line, i) => [order.id, line.sku, taxable[i], taxes[i]].join(","));
}
`;

const TAX_STARTER = `/**
 * Sales tax, in whole cents. Rates are basis points: 825 is 8.25%. The receipt and the finance
 * export (src/finance/export.ts) both get line taxes from here.
 */

/** The tax on an amount, rounded half up to the cent. */
export function taxOn(amount: number, rate: number): number {
  return Math.round((amount * rate) / 10000);
}

/** Each line's tax, in the order given. */
export function lineTaxes(amounts: number[], rate: number): number[] {
  return amounts.map((amount) => taxOn(amount, rate));
}
`;

const TAX_REFERENCE = `/**
 * Sales tax, in whole cents. Rates are basis points: 825 is 8.25%. The receipt and the finance
 * export (src/finance/export.ts) both get line taxes from here.
 */

/** The tax on an amount, rounded half up to the cent. */
export function taxOn(amount: number, rate: number): number {
  return Math.round((amount * rate) / 10000);
}

/**
 * Each line's share of the tax on all of them, in the order given; the shares add up to it
 * exactly. A line gets its own tax rounded down, and the cents left over go one each to the
 * largest remainders, the earlier line first on a tie.
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

const RECEIPT_STARTER = `import { lineTaxes, taxOn } from "./tax";
import type { Order, Receipt } from "./types";

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

const RECEIPT_REFERENCE = `import { lineTaxes } from "./tax";
import type { Order, Receipt } from "./types";

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

/** Changes `from` to `to` in `text`, failing loudly if `from` is not there. */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`storefront example: "${from}" not found`);
  return text.replace(from, to);
}

/** Later issues for this project, in board order; numbers follow the project's first ones. */
export const issues: SeedIssue[] = [
  {
    id: "free-shipping-banner",
    title: "Show how far the cart is from free shipping",
    summary: "A banner in the cart drawer telling shoppers what's left to spend for free shipping.",
    difficulty: "easy",
    kind: "feature",
    language: "javascript",
    skills: ["money", "reading-code", "ui-copy"],
    task: `The free-shipping banner from the old site is coming back, above the checkout button in the cart drawer. From Lena:

> Marketing ran it for a month last spring and average order value went up 6%. The copy below is final; design has signed off.

| Cart | Banner |
|---|---|
| empty | none |
| under $50.00 | Spend $12.50 more for free shipping |
| $50.00 or more | Your order ships free |

Write \`shippingBanner(order)\` in \`src/cart/shipping.js\`: the banner's text, or \`null\` when there is none. "$50.00 or more" is the same amount \`shippingFor\` already charges shipping on, so the banner never promises free shipping that checkout then charges for. Amounts read the way they do everywhere else in the cart.`,
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
    comments: [
      lena(
        "Marketing measured +6% average order value with this banner last spring. Copy is final, please don't reword it.",
      ),
      ada(
        "Money in the drawer all goes through `formatPrice` in format.js, so it reads the same everywhere.",
      ),
    ],
    hints: [
      {
        text: "What does `shippingFor` compare with the threshold? The banner should be working from the same number.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 8 },
      },
      {
        text: "Try the rain jacket with a 10% code on paper: what does the shopper actually pay for it, and how far is that from $50.00?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "ada-format-price",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "blocking",
        text: [
          "We format money in one place, `formatPrice` in format.js, so the banner matches the rest of the drawer. Can we use it here instead of `toFixed`?",
          "`toFixed` here means the banner formats money its own way. Can it go through `formatPrice` like the rest of the drawer?",
        ],
        when: { pattern: "\\.toFixed\\(", present: true, file: "src/cart/shipping.js" },
        repeat: "while-true",
      },
      {
        id: "ada-threshold",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "nit",
        text: [
          "Nit: `FREE_SHIPPING_FROM` is right there. If marketing moves the threshold, a second 5000 in the banner would drift.",
        ],
        when: {
          pattern: "^(?!export const FREE_SHIPPING_FROM)[^\\n]*\\b5000\\b",
          present: true,
          file: "src/cart/shipping.js",
        },
      },
    ],
    private: {
      reference: { "src/cart/shipping.js": SHIPPING_REFERENCE },
      examples: {
        "ada-format-price": {
          fires: [
            {
              "src/cart/shipping.js": swap(
                SHIPPING_REFERENCE,
                'formatPrice(FREE_SHIPPING_FROM - total) + " more',
                '"$" + ((FREE_SHIPPING_FROM - total) / 100).toFixed(2) + " more',
              ),
            },
          ],
          quiet: [{ "src/cart/shipping.js": SHIPPING_REFERENCE }],
        },
        "ada-threshold": {
          fires: [
            {
              "src/cart/shipping.js": swap(
                SHIPPING_REFERENCE,
                "total >= FREE_SHIPPING_FROM)",
                "total >= 5000)",
              ),
            },
          ],
          quiet: [{ "src/cart/shipping.js": SHIPPING_REFERENCE }],
        },
      },
    },
  },
  {
    id: "stale-cart-summary",
    title: "Cart drawer shows the old total after changing quantity",
    summary: "Since the cart summary was memoised, some changes don't show up in the drawer.",
    difficulty: "medium",
    kind: "bug",
    language: "javascript",
    skills: ["caching", "debugging", "code-review"],
    task: `Ada's PR #812 memoised \`Cart.summary()\` last Thursday. The cart drawer calls it on every render, and on a 60-line cart that was costing 38 ms a frame; now it's about 2. Since the release, support has a stack of tickets like this one:

> I changed the jeans from 1 to 2 in my cart and it still said $59.00. Then checkout charged me $118.00.

Checkout prices the order on the server, so nobody was overcharged, but the drawer and the header badge show whatever \`summary()\` in \`src/cart/cart.js\` returns. Find what the memo broke and fix it. Keep the memo.

\`replay(actions)\` at the bottom of the file is what the cart's tests use: it plays a session on a new cart and returns what \`summary()\` showed each time it was asked.`,
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
    comments: [
      jo(
        '23 tickets since Thursday, all "the cart shows the wrong total". Removing an item fixes it for them, changing the quantity doesn\'t.',
      ),
      ada(
        "That's my memo, sorry. Please keep it though: the drawer went from 38 ms to 2 ms a frame on big carts.",
      ),
    ],
    hints: [
      {
        text: "Which changes to the cart does the memo's key notice? Try adding the same item twice and asking for the summary after each.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 10 },
      },
      {
        text: "Describing the whole cart in a key means remembering everything that could change. The cart already knows each moment it changes.",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "ada-keep-memo",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "blocking",
        text: [
          "This takes the memo out, so the drawer goes back to repricing the cart on every frame. Can we keep it and have it notice changes instead?",
          "Without the memo we're back to 38 ms a frame on big carts. Can the fix keep `summary()` cached?",
        ],
        when: {
          pattern: "this\\.\\w*([Cc]ache|[Mm]emo)",
          present: false,
          file: "src/cart/cart.js",
        },
        repeat: "while-true",
      },
      {
        id: "ada-stringify",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "nit",
        text: [
          "Nit: stringifying every line on each call is most of what pricing the cart cost in the first place. Could the cart note when it changes instead?",
        ],
        when: { pattern: "JSON\\.stringify\\(", present: true, file: "src/cart/cart.js" },
      },
      {
        id: "jo-jeans",
        author: "Jo T",
        role: "Support",
        where: "issue",
        severity: "info",
        text: [
          "The jeans one passes on the pull request, nice. I'll reply to those tickets once it ships.",
        ],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/cart/cart.js": CART_REFERENCE },
      examples: {
        "ada-keep-memo": {
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
        "ada-stringify": {
          fires: [
            {
              "src/cart/cart.js": swap(
                CART_STARTER,
                'this.lines.map((l) => l.sku).join(",")',
                "JSON.stringify(this.lines)",
              ),
            },
          ],
          quiet: [{ "src/cart/cart.js": CART_REFERENCE }],
        },
      },
    },
  },
  {
    id: "receipt-tax-split",
    title: "Receipt tax lines don't add up to the tax charged",
    summary:
      "Line taxes on receipts and in the finance export don't sum to the order's tax, and gift cards get taxed.",
    difficulty: "hard",
    kind: "bug",
    language: "typescript",
    skills: ["money", "rounding", "debugging", "reading-code"],
    task: `From Rui in Finance:

> September's sales-tax filing came out $310.22 under what we actually charged. The export's tax column doesn't add up to the tax on the receipts. And a customer forwarded a receipt that charges tax on a gift card.

One of the orders from Rui's sample, at 8.25%:

\`\`\`text
Order #20417                      net      tax
  Rain jacket                  $45.00    $3.71
  Tee × 2                      $45.00    $3.71
  Socks                        $10.80    $0.89
  Tax                                    $8.32   ← the lines add up to $8.31
\`\`\`

Finance's rule: an order is taxed once, on its taxable amount times the rate, rounded half up to the cent. Each line shows its share, and the shares add up to exactly that: every line gets its own amount times the rate, rounded down, and the cents left over go one each to the lines with the largest remainders (the earlier line on a tie). Gift cards (\`taxable: false\`) carry no tax.

\`receipt(order)\` in \`src/checkout/receipt.ts\` builds the receipt. Line taxes come from \`src/checkout/tax.ts\`, which the finance export (\`src/finance/export.ts\`) uses too. Rates are basis points: 825 is 8.25%.`,
    entry: "src/checkout/receipt.ts",
    entrypoint: "receipt",
    starter: RECEIPT_STARTER,
    files: [
      { path: "src/checkout/tax.ts", role: "edit", language: "typescript", text: TAX_STARTER },
      { path: "src/checkout/types.ts", role: "read", language: "typescript", text: TYPES_TS },
      { path: "src/finance/export.ts", role: "read", language: "typescript", text: EXPORT_TS },
    ],
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
    comments: [
      rui(
        "September's filing is $310.22 under what we charged, across about 9,000 orders. I'd like to refile before the 20th, so the export has to be right, not just the receipts.",
      ),
      mateo(
        "The export only reads `lineTaxes`, so whatever the receipt shows needs to come from there too.",
      ),
    ],
    hints: [
      {
        text: "Rounding each line on its own can never promise the lines add up. Start from the order's tax, then decide which lines get the cents left over.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 15 },
      },
      {
        text: "Compare how the finance export decides what each line's taxable amount is with what the receipt does.",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
      {
        text: "A remainder is easiest to compare while the amounts are still whole numbers, before anything is divided.",
        when: { behaviour: "failing-pushes", atLeast: 4 },
      },
    ],
    team: [
      {
        id: "mateo-line-taxes",
        author: "Mateo O",
        role: "Backend",
        where: "review",
        severity: "blocking",
        text: [
          "The receipt doesn't call `lineTaxes` any more, but the finance export still does. Then the export keeps the old numbers and the filing stays off. Can the fix live in tax.ts so both get it?",
          "If the receipt works out line taxes on its own, src/finance/export.ts and the receipts disagree again. Can this go through `lineTaxes`?",
        ],
        when: { pattern: "lineTaxes\\(", present: false, file: "src/checkout/receipt.ts" },
        repeat: "while-true",
      },
      {
        id: "mateo-to-fixed",
        author: "Mateo O",
        role: "Backend",
        where: "review",
        severity: "blocking",
        text: [
          "`toFixed` rounds through a float and a string. Money stays in whole cents here; can we keep this in integers?",
        ],
        when: { pattern: "\\.toFixed\\(|parseFloat\\(", present: true },
        repeat: "while-true",
      },
      {
        id: "ada-long-line-taxes",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "nit",
        text: [
          "Nit: `lineTaxes` is getting long. Would a helper for handing out the leftover cents read better?",
        ],
        when: { metric: "function-lines", above: 20, file: "src/checkout/tax.ts" },
      },
      {
        id: "rui-20417",
        author: "Rui F",
        role: "Finance",
        where: "review",
        severity: "info",
        text: ["That's #20417 to the cent. I'll rerun September's export once this is merged."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: {
        "src/checkout/receipt.ts": RECEIPT_REFERENCE,
        "src/checkout/tax.ts": TAX_REFERENCE,
      },
      examples: {
        "mateo-line-taxes": {
          fires: [
            {
              "src/checkout/receipt.ts": swap(
                RECEIPT_REFERENCE,
                "const taxes = lineTaxes(taxable, order.taxRate);",
                "const taxes = taxable.map((amount) => Math.floor((amount * order.taxRate) / 10000));",
              ),
            },
          ],
          quiet: [
            {
              "src/checkout/receipt.ts": RECEIPT_REFERENCE,
              "src/checkout/tax.ts": TAX_REFERENCE,
            },
            { "src/checkout/receipt.ts": RECEIPT_STARTER },
          ],
        },
        "mateo-to-fixed": {
          fires: [
            {
              "src/checkout/tax.ts": swap(
                TAX_STARTER,
                "return Math.round((amount * rate) / 10000);",
                "return Number(((amount * rate) / 10000).toFixed(0));",
              ),
            },
          ],
          quiet: [
            {
              "src/checkout/receipt.ts": RECEIPT_REFERENCE,
              "src/checkout/tax.ts": TAX_REFERENCE,
            },
          ],
        },
      },
    },
  },
];
