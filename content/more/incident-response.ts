/**
 * The incident (docs/incident.md): one playable production incident, unlisted, opened from
 * /incident. A fictional shop's checkout fails guest orders after a routine change, while the
 * team's AI tools are down.
 */
import type { SeedIssue } from "../seed";

export const issues: SeedIssue[] = [
  {
    id: "checkout-guest-shipping",
    title: "SEV-1: checkout is failing for guest orders",
    summary: "Paged at 02:14: checkout-api is returning 500s. The usual AI tools are down too.",
    kind: "bug",
    difficulty: "easy",
    language: "javascript",
    skills: ["debugging", "reading-logs", "incident-response"],
    task: `**SEV-1 · checkout-api · paged 02:14**

> **checkout-api: 5xx rate 58% (threshold 2%) for 9 minutes.** \`POST /quote\` is failing.

You're on call for Kettlebrook, a homeware shop. Checkout is failing for a lot of customers, and tonight the team's AI tools are down as well: the coding assistant, the log summariser and the bot that writes status updates. It's you, the logs and the tests.

**Restore checkout**

1. Find what's failing in \`logs/checkout-api.log\`.
2. Reproduce it. The failing order from the logs is already a regression test in \`src/checkout/quote.test.js\`: run the tests (Ctrl/⌘-Enter).
3. Fix \`quoteOrder\` in \`src/checkout/quote.js\` so every order gets a correct quote: guests and members, with free shipping where it applies.
4. Open a pull request, get CI green, merge it, then deploy it from the pull request.

\`quoteOrder(order)\` returns \`{ subtotal, shipping, total }\` in cents. Shipping is $4.95. It's free from $50 for everyone, and from $30 for loyalty members (CHK-412, shipped Thursday behind a flag). A guest is \`{ guest: true }\` and has no loyalty record; a member whose tier is \`"none"\` has lapsed and gets the standard threshold.`,
    entry: "src/checkout/quote.js",
    entrypoint: "quoteOrder",
    starter: `import { lineTotal, sum } from "./money.js";
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
`,
    files: [
      { path: "src/checkout/money.js", role: "read", language: "javascript", text: `/** Money is whole cents everywhere: never floats. */

/** What one line of an order costs before shipping. */
export function lineTotal(item) {
  return item.price * item.quantity;
}

export function sum(amounts) {
  return amounts.reduce((total, amount) => total + amount, 0);
}
` },
      { path: "src/checkout/shipping.js", role: "read", language: "javascript", text: `/** Standard shipping, in cents. */
export const SHIPPING = 495;
/** Free shipping from these subtotals, in cents: for everyone, and for loyalty members (CHK-412). */
export const FREE_FROM = 5000;
export const MEMBER_FREE_FROM = 3000;

/** Shipping for an order's subtotal: free from $50, or from $30 for a loyalty member. */
export function shippingFor(subtotal, member) {
  return subtotal >= (member ? MEMBER_FREE_FROM : FREE_FROM) ? 0 : SHIPPING;
}
` },
      { path: "logs/checkout-api.log", role: "docs", language: "text", text: `2026-10-24T01:58:02.114Z INFO  checkout-api  POST /quote 200 11ms order=88199 customer=guest items=1
2026-10-24T01:59:40.870Z INFO  checkout-api  POST /quote 200 9ms order=88201 customer=member:30418 items=3
2026-10-24T02:00:00.002Z INFO  flags         member-free-shipping rollout 10% -> 100% (scheduled, CHK-412)
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
` },
      { path: "RUNBOOK.md", role: "docs", language: "markdown", text: `# checkout-api on-call runbook

_Last reviewed: when the assistant was up._

1. Paste the alert into the assistant.
2. Do what it says.
3. If the assistant is unavailable, see step 1.

## Appendix B (recovered from the 2019 wiki export)

- Read the logs: \`logs/checkout-api.log\`. The stack trace names a file and a line.
- Reproduce it with a test before changing anything. Run tests: Ctrl/⌘-Enter.
- Fix it, open a pull request (Ctrl/⌘-Shift-Enter), wait for CI, merge it.
- Deploy from the merged pull request, then check the error rate comes down.
- Don't wrap it in a try/catch and go back to bed. We will find out.
` },
    ],
    inputs: [
      { customer: { id: "m-41022", loyalty: { tier: "silver" } }, items: [{ sku: "wool-throw", price: 3500, quantity: 1 }] },
      { customer: { guest: true }, items: [{ sku: "stoneware-mug", price: 1800, quantity: 2 }] },
      { customer: { guest: true }, items: [{ sku: "linen-sheets", price: 6200, quantity: 1 }] },
      { customer: { id: "m-30418", loyalty: { tier: "none" } }, items: [{ sku: "tea-towel", price: 800, quantity: 5 }] },
      { customer: { guest: true }, items: [{ sku: "egg-cup", price: 600, quantity: 2 }] },
      { customer: { id: "m-11873", loyalty: { tier: "gold" } }, items: [{ sku: "candle", price: 1250, quantity: 2 }] },
    ],
    expected: [
      { subtotal: 3500, shipping: 0, total: 3500 },
      { subtotal: 3600, shipping: 495, total: 4095 },
      { subtotal: 6200, shipping: 0, total: 6200 },
      { subtotal: 4000, shipping: 495, total: 4495 },
      { subtotal: 1200, shipping: 495, total: 1695 },
      { subtotal: 2500, shipping: 495, total: 2995 },
    ],
    names: [
      "member, $35 order: free shipping from $30 (CHK-412)",
      "regression: guest order #88213 from the incident",
      "guest, $62 order: free shipping from $50",
    ],
    hidden: [3, 4, 5],
    comments: [
      { author: "Noor A", role: "Incident commander", body: "I'm on comms, you're on the fix. Checkout is failing for over half of orders. The assistant, the log summariser and the status bot are all down, so tonight's status updates are artisanal. Logs are in `logs/checkout-api.log`." },
      { author: "Bea L", role: "Support", body: "Support queue is at 212. One customer has written MY MUGS four times, which is fair." },
    ],
    hints: [
      {
        text: "Put the expected quote for order #88213 next to what came back. Who should get free shipping from $30, and is a guest one of them?",
        when: { behaviour: "runs-without-progress", atLeast: 2 },
      },
      {
        text: "A guest has no loyalty record at all. Read your condition out loud for a customer like that: does it call them a member?",
        when: {
          any: [
            { behaviour: "runs-without-progress", atLeast: 4 },
            { behaviour: "failing-pushes", atLeast: 2 },
          ],
        },
      },
    ],
    team: [
      {
        id: "kai-flag",
        author: "Kai M",
        role: "Platform",
        where: "issue",
        severity: "info",
        text: ["Reading logs by hand at 2am. Respect. For what it's worth, a flag rolled to 100% at 02:00 and the first 500 is 31 seconds later. Coincidences are rare at this hour."],
        when: { opened: "logs/checkout-api.log" },
      },
      {
        id: "tomasz-reproduced",
        author: "Tomasz W",
        role: "Checkout",
        where: "issue",
        severity: "info",
        text: ["That failing test is my CHK-412 change. In my defence, I tested it as a member. I am always logged in as a member. I am, it turns out, the only customer I checked."],
        when: { ran: "case-2", is: "failing" },
      },
      {
        id: "noor-green",
        author: "Noor A",
        role: "Incident commander",
        where: "issue",
        severity: "info",
        text: ["Green locally. Open a pull request and I'll watch CI. Status page draft: \"We've identified the issue.\" First status update I've typed myself in years, and it's true."],
        when: { ran: "case-2", is: "passing" },
      },
      {
        id: "noor-catch",
        author: "Noor A",
        role: "Incident commander",
        where: "review",
        severity: "blocking",
        text: ["A catch here turns a loud failure into a quiet wrong quote. Can we fix the guest case itself instead of hiding the error?"],
        when: { pattern: "catch\\s*[({]", present: true, file: "src/checkout/quote.js" },
        repeat: "while-true",
      },
      {
        id: "bea-pr",
        author: "Bea L",
        role: "Support",
        where: "review",
        severity: "info",
        text: ["I'll tell the 212 people in the queue the moment this is deployed. No pressure. Some pressure."],
        when: { event: "pull-request" },
      },
      {
        id: "ines-shipping",
        author: "Ines R",
        role: "Finance",
        where: "review",
        severity: "info",
        text: ["Finance, awake for reasons. Guests pay shipping under $50 again. I have never been this happy to see a fee."],
        when: { all: [{ check: "case-2", is: "passing" }, { check: "case-5", is: "passing" }] },
      },
    ],
    private: {
      reference: { "src/checkout/quote.js": `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

/**
 * The quote checkout shows and charges for an order, in cents. order.customer is
 * { guest: true } at guest checkout, or a member with a loyalty record.
 */
export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  // CHK-412: loyalty members get free shipping from $30. Guests have no loyalty record.
  const tier = order.customer.loyalty?.tier ?? "none";
  const shipping = shippingFor(subtotal, tier !== "none");
  return { subtotal, shipping, total: subtotal + shipping };
}
` },
      examples: {
        "noor-catch": {
          fires: [{ "src/checkout/quote.js": `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  let member = false;
  try {
    member = order.customer.loyalty.tier !== "none";
  } catch (error) {
    member = false;
  }
  const shipping = shippingFor(subtotal, member);
  return { subtotal, shipping, total: subtotal + shipping };
}
` }],
          quiet: [{ "src/checkout/quote.js": `import { lineTotal, sum } from "./money.js";
import { shippingFor } from "./shipping.js";

export function quoteOrder(order) {
  const subtotal = sum(order.items.map(lineTotal));
  const tier = order.customer.loyalty?.tier ?? "none";
  const shipping = shippingFor(subtotal, tier !== "none");
  return { subtotal, shipping, total: subtotal + shipping };
}
` }],
        },
      },
    },
  },
];
