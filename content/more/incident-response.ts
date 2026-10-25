/**
 * Guest checkout (JS-001): a fictional shop's checkout fails guest orders after a routine change.
 * quote.js is the one editable file; shipping.js and money.js are support code it imports. It
 * began as the playable incident; its id and key stay, because recorded work names them.
 */
import type { SeedIssue } from "../seed";

const QUOTE = `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

/**
 * The quote checkout shows and charges for an order, in cents. order.customer is
 * { guest: true } at guest checkout, or a member with a loyalty record.
 */
export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  // CHK-412: loyalty members get free shipping from $30.
  const member = order.customer.loyalty.tier !== "none";
  const shipping = shippingFor(subtotal, member);
  return { subtotal, shipping, total: subtotal + shipping };
}
`;

const SHIPPING = `/** Standard shipping, in cents. */
export const SHIPPING = 495;
/** Free shipping from these subtotals, in cents: for everyone, and for loyalty members (CHK-412). */
export const FREE_FROM = 5000;
export const MEMBER_FREE_FROM = 3000;

/** Shipping for an order's subtotal: free from $50, or from $30 for a loyalty member. */
export function shippingFor(subtotal, member) {
  return subtotal >= (member ? MEMBER_FREE_FROM : FREE_FROM) ? 0 : SHIPPING;
}
`;

/** The quote with its membership line replaced: one-file fixes, right and wrong. */
const quoteWith = (line: string) =>
  QUOTE.replace(
    `  const member = order.customer.loyalty.tier !== "none";`,
    line,
  );

/** Membership decided by a helper in quote.js that takes the customer: another correct design. */
const HELPER_QUOTE = (
  isMember: string,
) => `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

/** A loyalty member: a customer with a loyalty record whose tier is not "none". Guests have none. */
function isMember(customer) {
  ${isMember}
}

/**
 * The quote checkout shows and charges for an order, in cents. order.customer is
 * { guest: true } at guest checkout, or a member with a loyalty record.
 */
export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  const shipping = shippingFor(subtotal, isMember(order.customer));
  return { subtotal, shipping, total: subtotal + shipping };
}
`;

const guest = { guest: true };
const member = (id: string, tier: string) => ({ id, loyalty: { tier } });
const item = (sku: string, price: number, quantity = 1) => ({
  sku,
  price,
  quantity,
});
const quote = (subtotal: number, shipping: number) => ({
  subtotal,
  shipping,
  total: subtotal + shipping,
});

export const issues: SeedIssue[] = [
  {
    id: "checkout-guest-shipping",
    key: "JS-001",
    title: "Guest checkout fails with a server error",
    summary:
      "Since Thursday's release, guests get an error instead of a quote at checkout. Members are fine.",
    kind: "bug",
    difficulty: "easy",
    language: "javascript",
    skills: ["debugging", "reading-logs"],
    task: `Kettlebrook's checkout has been failing since Thursday's release, which shipped CHK-412 (free shipping from $30 for loyalty members). Every customer checking out as a guest gets "Something went wrong" on the payment page instead of a quote: \`POST /quote\` returns 500 with \`TypeError: Cannot read properties of undefined (reading 'tier')\` thrown in \`quoteOrder\`. Members' orders still get quotes. For example, guest order #88213 (two stoneware mugs at $18.00 each) failed.

Fix \`quoteOrder\` so that every order gets a correct quote.

## Input and output

\`quoteOrder(order)\` takes an order and returns \`{ subtotal, shipping, total }\`, all whole cents (never floats); the payment page charges exactly that.

- \`order.items\` is a list of \`{ sku, price, quantity }\`, with \`price\` in cents. \`subtotal\` is the sum of \`price × quantity\` over the items.
- \`order.customer\` is either a guest, \`{ guest: true }\`, which has no loyalty record at all, or a member, \`{ id, loyalty: { tier } }\`, where \`tier\` is a string such as \`"silver"\`, \`"gold"\` or \`"none"\`.
- \`total\` is \`subtotal + shipping\`.

## Shipping rules

- Standard shipping is $4.95 (495 cents).
- Shipping is free for everyone when the subtotal is $50.00 (5000 cents) or more.
- A loyalty member gets free shipping when the subtotal is $30.00 (3000 cents) or more. A loyalty member is a customer with a loyalty record whose tier is not \`"none"\`.
- A guest is not a loyalty member. A member whose tier is \`"none"\` has lapsed and is not a loyalty member either: both get the standard $50 threshold.

## Code you can use

The starter imports these; their code is fixed and you cannot change it:

- \`lineTotal(item)\` returns \`item.price * item.quantity\`; \`sum(amounts)\` adds a list of numbers (0 for an empty list).
- \`shippingFor(subtotal, member)\` returns the shipping in cents under the rules above: 0 when \`subtotal\` is at least 3000 if \`member\` is \`true\`, or at least 5000 if it is \`false\`; 495 otherwise. The module also exports the constants \`SHIPPING\` (495), \`FREE_FROM\` (5000) and \`MEMBER_FREE_FROM\` (3000).

## Constraints

- Handle guests and lapsed members explicitly. Do not use \`catch\` (no \`try\`/\`catch\` and no \`.catch(\`): catching the error would turn the crash into a silently wrong quote.`,
    entry: "src/checkout/quote.js",
    entrypoint: "quoteOrder",
    starter: QUOTE,
    files: [
      {
        path: "src/checkout/shipping.js",
        role: "read",
        language: "javascript",
        text: SHIPPING,
      },
      {
        path: "src/checkout/money.js",
        role: "read",
        language: "javascript",
        text: `/** Money is whole cents everywhere: never floats. */

/** What one line of an order costs before shipping. */
export function lineTotal(item) {
  return item.price * item.quantity;
}

export function sum(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
`,
      },
    ],
    inputs: [
      {
        customer: member("m-41022", "silver"),
        items: [item("wool-throw", 3500)],
      },
      { customer: guest, items: [item("stoneware-mug", 1800, 2)] },
      { customer: guest, items: [item("linen-sheets", 6200)] },
      {
        customer: member("m-30418", "none"),
        items: [item("tea-towel", 800, 5)],
      },
      { customer: guest, items: [item("egg-cup", 600, 2)] },
      { customer: member("m-11873", "gold"), items: [item("candle", 1250, 2)] },
      { customer: member("m-52990", "gold"), items: [item("jug", 3000)] },
      { customer: guest, items: [item("blanket", 5000)] },
      { customer: guest, items: [item("blanket-small", 4999)] },
      {
        customer: member("m-20077", "none"),
        items: [item("wool-throw", 3500)],
      },
    ],
    expected: [
      quote(3500, 0),
      quote(3600, 495),
      quote(6200, 0),
      quote(4000, 495),
      quote(1200, 495),
      quote(2500, 495),
      quote(3000, 0),
      quote(5000, 0),
      quote(4999, 495),
      quote(3500, 495),
    ],
    names: [
      "member, $35 order: free shipping from $30 (CHK-412)",
      "regression: guest order #88213 from the logs",
      "guest, $62 order: free shipping from $50",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    hidden: [3, 4, 5, 6, 7, 8, 9],
    comments: [],
    hints: [],
    team: [
      {
        id: "catch-hides-guests",
        author: "Tomasz W",
        role: "Checkout",
        where: "review",
        severity: "blocking",
        text: [
          "Do not use catch: handle guests and lapsed members explicitly, so a missing loyalty record can never turn into a silently wrong quote.",
        ],
        when: { pattern: "catch\\s*[({]", present: true },
        repeat: "while-true",
      },
    ],
    private: {
      // The smallest safe fix: quote.js alone, shipping.js untouched.
      reference: {
        "src/checkout/quote.js": quoteWith(
          `  // Guests have no loyalty record; a lapsed member's tier is "none".
  const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
        ),
      },
      alternatives: [
        // Membership decided in a helper that takes the customer.
        {
          "src/checkout/quote.js": HELPER_QUOTE(
            `return (customer.loyalty?.tier ?? "none") !== "none";`,
          ),
        },
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = Boolean(order.customer.loyalty) && order.customer.loyalty.tier !== "none";`,
          ),
        },
      ],
      wrong: [
        // The crash goes away and guests become members.
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = order.customer.loyalty?.tier !== "none";`,
          ),
        },
        // Anyone with a loyalty record counts, lapsed members included.
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = !order.customer.guest;`,
          ),
        },
        // Guests skip the shipping rule entirely.
        {
          "src/checkout/quote.js": QUOTE.replace(
            `  // CHK-412: loyalty members get free shipping from $30.`,
            `  if (order.customer.guest) return { subtotal, shipping: 0, total: subtotal };\n  // CHK-412: loyalty members get free shipping from $30.`,
          ),
        },
        // Everyone gets the member threshold.
        {
          "src/checkout/quote.js": QUOTE.replace(
            "shippingFor(subtotal, member)",
            "shippingFor(subtotal, true)",
          ),
        },
        // A helper, but any loyalty record makes a member.
        {
          "src/checkout/quote.js": HELPER_QUOTE(
            `return Boolean(customer.loyalty);`,
          ),
        },
        // Off by one at both thresholds.
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
          ).replace(
            "shippingFor(subtotal, member)",
            "subtotal > (member ? 3000 : 5000) ? 0 : 495",
          ),
        },
      ],
      examples: {
        "catch-hides-guests": {
          fires: [
            {
              "src/checkout/quote.js": quoteWith(`  let member = false;
  try {
    member = order.customer.loyalty.tier !== "none";
  } catch (error) {
    member = false;
  }`),
            },
          ],
          quiet: [
            {
              "src/checkout/quote.js": quoteWith(
                `  const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
              ),
            },
          ],
        },
      },
    },
  },
];
