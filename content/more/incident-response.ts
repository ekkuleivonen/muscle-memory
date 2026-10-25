/**
 * The incident (docs/incident.md): one playable production incident, unlisted, opened from
 * /incident. A fictional shop's checkout fails guest orders after a routine change, while the
 * team's AI tools are down. Both files of the change are the player's to edit.
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

/** The two-file design: shipping.js decides who is a member, quote.js passes the customer. */
const TWO_FILE_SHIPPING = (
  isMember: string,
) => `/** Standard shipping, in cents. */
export const SHIPPING = 495;
/** Free shipping from these subtotals, in cents: for everyone, and for loyalty members (CHK-412). */
export const FREE_FROM = 5000;
export const MEMBER_FREE_FROM = 3000;

/** A loyalty member: a customer with a loyalty record whose tier is not "none". Guests have none. */
export function isMember(customer) {
  ${isMember}
}

/** Shipping for an order's subtotal: free from $50, or from $30 for a loyalty member. */
export function shippingFor(subtotal, customer) {
  return subtotal >= (isMember(customer) ? MEMBER_FREE_FROM : FREE_FROM) ? 0 : SHIPPING;
}
`;
const TWO_FILE_QUOTE = `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

/**
 * The quote checkout shows and charges for an order, in cents. order.customer is
 * { guest: true } at guest checkout, or a member with a loyalty record.
 */
export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  const shipping = shippingFor(subtotal, order.customer);
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
    title: "SEV-1: checkout is failing for guest orders",
    summary:
      "Paged at 02:14: checkout-api is returning 500s. The usual AI tools are down too.",
    kind: "bug",
    difficulty: "easy",
    language: "javascript",
    skills: ["debugging", "reading-logs", "incident-response"],
    task: `**SEV-1 · checkout-api · paged 02:14**

> **checkout-api: 5xx rate 58% (threshold 2%) for 9 minutes.** \`POST /quote\` is failing.

You're on call for Kettlebrook, a homeware shop. Checkout is failing for a lot of customers, and tonight the team's AI tools are down as well: the coding assistant, the log summariser and the bot that writes status updates. It's you, the logs and the tests. The rest of the team is in the chat.

**Restore checkout**

1. Find what's failing in \`logs/checkout-api.log\`.
2. Reproduce it. The failing order from the logs is already a regression test in \`src/checkout/quote.test.js\`: run the tests (Ctrl/⌘-Enter).
3. Fix it in \`src/checkout/quote.js\`, \`src/checkout/shipping.js\` or both, so every order gets a correct quote: guests and members, with free shipping where it applies.
4. Open a pull request, get CI green and merge it. Main goes straight to production.

\`quoteOrder(order)\` returns \`{ subtotal, shipping, total }\` in cents. Shipping is $4.95. It's free from $50 for everyone, and from $30 for loyalty members (CHK-412, shipped Thursday). A guest is \`{ guest: true }\` and has no loyalty record; a member whose tier is \`"none"\` has lapsed and gets the standard threshold.`,
    entry: "src/checkout/quote.js",
    entrypoint: "quoteOrder",
    starter: QUOTE,
    files: [
      {
        path: "src/checkout/shipping.js",
        role: "edit",
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
      {
        path: "logs/checkout-api.log",
        role: "docs",
        language: "text",
        text: `2026-10-24T01:58:02.114Z ERROR checkout-api  POST /quote 500 3ms order=88199 customer=guest items=1
    TypeError: Cannot read properties of undefined (reading 'tier')
        at quoteOrder (src/checkout/quote.js:11:41)
        at handleQuote (src/http/quote-route.js:27:18)
2026-10-24T01:59:40.870Z INFO  checkout-api  POST /quote 200 9ms order=88201 customer=member:30418 items=3
2026-10-24T02:00:00.002Z INFO  newsletter    "Midnight mugs" sent to 41,203 subscribers
2026-10-24T02:00:07.551Z INFO  checkout-api  POST /quote 200 12ms order=88202 customer=member:41022 items=2
2026-10-24T02:00:31.019Z ERROR checkout-api  POST /quote 500 3ms order=88203 customer=guest items=2
    TypeError: Cannot read properties of undefined (reading 'tier')
        at quoteOrder (src/checkout/quote.js:11:41)
        at handleQuote (src/http/quote-route.js:27:18)
2026-10-24T02:01:12.433Z INFO  checkout-api  POST /quote 200 10ms order=88204 customer=member:11873 items=1
2026-10-24T02:02:48.902Z ERROR checkout-api  POST /quote 500 2ms order=88206 customer=guest items=1
    TypeError: Cannot read properties of undefined (reading 'tier')
        at quoteOrder (src/checkout/quote.js:11:41)
        at handleQuote (src/http/quote-route.js:27:18)
2026-10-24T02:05:00.000Z WARN  checkout-api  5xx rate 31% over 5m (threshold 2%)
2026-10-24T02:09:17.640Z ERROR checkout-api  POST /quote 500 3ms order=88213 customer=guest items=[stoneware-mug 1800x2]
    TypeError: Cannot read properties of undefined (reading 'tier')
        at quoteOrder (src/checkout/quote.js:11:41)
        at handleQuote (src/http/quote-route.js:27:18)
2026-10-24T02:10:02.118Z INFO  checkout-api  POST /quote 200 13ms order=88214 customer=member:52990 items=4
2026-10-24T02:12:44.305Z WARN  assistant     upstream unavailable (503); retrying in 300s
2026-10-24T02:13:58.771Z WARN  checkout-api  5xx rate 58% over 9m (threshold 2%) -> paging on-call
2026-10-24T02:14:00.000Z INFO  pager         SEV-1 checkout-api -> you
2026-10-24T02:14:05.512Z WARN  status-bot    upstream unavailable (503); status update not posted
`,
      },
      {
        path: "RUNBOOK.md",
        role: "docs",
        language: "markdown",
        text: `# checkout-api on-call runbook

_Last reviewed: when the assistant was up._

1. Paste the alert into the assistant.
2. Do what it says.
3. If the assistant is unavailable, see step 1.

## Appendix B (recovered from the 2019 wiki export)

- Read the logs: \`logs/checkout-api.log\`. The stack trace names a file and a line.
- Reproduce it with a test before changing anything. Run tests: Ctrl/⌘-Enter.
- Fix it, open a pull request (Ctrl/⌘-Shift-Enter), wait for CI, merge it. Main ships itself.
- Don't wrap it in a try/catch and go back to bed. We will find out.
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
      "regression: guest order #88213 from the incident",
      "guest, $62 order: free shipping from $50",
      "lapsed member, $40 order: standard threshold",
      "guest, $12 order: standard shipping",
      "member, $25 order: under the member threshold",
      "member at exactly $30: free shipping",
      "guest at exactly $50: free shipping",
      "guest at $49.99: standard shipping",
      "lapsed member, $35 order: no member threshold",
    ],
    hidden: [3, 4, 5, 6, 7, 8, 9],
    // The ticket's thread from the start: what the team knows, as clues. Atmosphere is the chat's.
    comments: [
      {
        author: "Kai M",
        role: "Platform",
        body: 'Traffic jumped at 02:00 when the "Midnight mugs" newsletter went out. Most of those visitors check out as guests.',
      },
      {
        author: "Bea L",
        role: "Support",
        body: "Every complaint tonight is from someone checking out without an account. Members aren't writing in.",
      },
      {
        author: "Tomasz W",
        role: "Checkout",
        body: "CHK-412 is mine, shipped Thursday: members get free shipping from $30. The member check is in `quote.js`, the thresholds in `shipping.js`. I tested it with my own account, which is a member account.",
      },
    ],
    hints: [
      {
        text: "Put the expected quote for order #88213 next to what came back. Who should get free shipping from $30, and is a guest one of them?",
        when: { behaviour: "runs-without-progress", atLeast: 2 },
      },
      {
        text: 'A guest has no loyalty record at all, and a lapsed member\'s tier is "none". Read your membership check out loud for both: does it call either of them a member?',
        when: {
          any: [
            { behaviour: "runs-without-progress", atLeast: 4 },
            { behaviour: "failing-pushes", atLeast: 2 },
          ],
        },
      },
    ],
    // A failing push opens a CI finding only Resolve clears; CI itself still decides merging.
    ciFindings: "explicit",
    // Pull request review: actionable findings only.
    team: [
      {
        id: "catch-hides-guests",
        author: "Tomasz W",
        role: "Checkout",
        where: "review",
        severity: "blocking",
        text: [
          "A catch here turns the crash into a silently wrong quote. Handle the guest case explicitly instead of catching the error.",
        ],
        when: { pattern: "catch\\s*[({]", present: true },
        repeat: "while-true",
        resolve: "explicit",
      },
      {
        id: "thresholds-in-one-place",
        author: "Tomasz W",
        role: "Checkout",
        where: "review",
        severity: "nit",
        text: [
          "Nit: these amounts are defined in `shipping.js`. Import the constants so the thresholds live in one place.",
        ],
        when: {
          pattern: "\\b(3000|5000|495)\\b",
          present: true,
          file: "src/checkout/quote.js",
        },
        resolve: "explicit",
      },
    ],
    chat: [
      {
        id: "noor-comms",
        author: "Noor A",
        role: "Incident commander",
        after: { start: true },
        text: "I'm on comms, you're on the fix. The status bot is down too, so tonight's updates are artisanal.",
      },
      {
        id: "bea-queue",
        author: "Bea L",
        role: "Support",
        after: { start: true },
        text: "Support queue is at 212. One customer has written MY MUGS four times, which is fair.",
      },
      {
        id: "mia-newsletter",
        author: "Mia S",
        role: "Marketing",
        after: { start: true },
        text: 'The newsletter was mine. "No account needed!" felt like a great headline at 6pm.',
      },
      {
        id: "kai-logs",
        author: "Kai M",
        role: "Platform",
        after: { opened: "logs/checkout-api.log" },
        text: "Reading logs by hand at 2am. Respect.",
      },
      {
        id: "tomasz-red",
        author: "Tomasz W",
        role: "Checkout",
        after: { ran: "case-2", is: "failing" },
        text: "Is that red test my change? Please say it isn't my change.",
      },
      {
        id: "noor-green",
        author: "Noor A",
        role: "Incident commander",
        after: { ran: "case-2", is: "passing" },
        text: "Green locally? Status page draft: \"We've identified the issue.\" First update I've typed myself in years, and it's true.",
      },
      {
        id: "bea-pr",
        author: "Bea L",
        role: "Support",
        after: { pullRequest: true },
        text: "I'll tell the queue the moment it's merged. No pressure. Some pressure.",
      },
      {
        id: "ines-ci",
        author: "Ines R",
        role: "Finance",
        after: { check: "case-2", is: "passing" },
        text: "Finance, awake for reasons. Guests pay shipping under $50 again on that build. I have never been this happy to see a fee.",
      },
      {
        id: "noor-resolved",
        author: "Noor A",
        role: "Incident commander",
        after: { merged: true },
        text: "Merged and shipping. Marking it resolved on the status page, by hand, slowly, savouring it.",
      },
      {
        id: "bea-told",
        author: "Bea L",
        role: "Support",
        after: { merged: true },
        text: "Telling the queue now. Someone already replied MY MUGS!! but happier.",
      },
      {
        id: "mia-next",
        author: "Mia S",
        role: "Marketing",
        after: { merged: true },
        text: 'Next newsletter headline: "Checkout works." Bold, I know.',
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
        // Membership decided next to the thresholds, in shipping.js.
        {
          "src/checkout/shipping.js": TWO_FILE_SHIPPING(
            `return (customer.loyalty?.tier ?? "none") !== "none";`,
          ),
          "src/checkout/quote.js": TWO_FILE_QUOTE,
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
        // The thresholds moved instead: everyone gets the member threshold.
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
          ),
          "src/checkout/shipping.js": SHIPPING.replace(
            "FREE_FROM = 5000",
            "FREE_FROM = 3000",
          ),
        },
        // Two files, but any loyalty record makes a member.
        {
          "src/checkout/shipping.js": TWO_FILE_SHIPPING(
            `return Boolean(customer.loyalty);`,
          ),
          "src/checkout/quote.js": TWO_FILE_QUOTE,
        },
        // Off by one at both thresholds.
        {
          "src/checkout/quote.js": quoteWith(
            `  const member = (order.customer.loyalty?.tier ?? "none") !== "none";`,
          ),
          "src/checkout/shipping.js": SHIPPING.replace(
            ">= (member",
            "> (member",
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
        "thresholds-in-one-place": {
          fires: [
            {
              "src/checkout/quote.js": QUOTE.replace(
                "shippingFor(subtotal, member)",
                "subtotal >= (member ? 3000 : 5000) ? 0 : 495",
              ),
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
