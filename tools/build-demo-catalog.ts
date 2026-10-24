/**
 * Synthetic demo catalog for designing the issue tracker against realistic work: four projects,
 * one per engineering area (frontend, backend, data, systems), with the kind of issues people
 * meet in a normal job. Never shipped as real content: the web app merges it only in builds
 * made with DEMO_CATALOG=1. Authored through the same lifecycle as the reference catalog, so it
 * obeys the same validation.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyCatalog,
  saveDraft,
  preview,
  markTested,
  publish,
  verifyCatalog,
  type ContentRef,
} from "../packages/catalog/catalog";

type Comment = { author: string; role?: string; body: string };

const challenge = (
  id: string,
  fields: {
    title: string;
    summary: string;
    difficulty: "warm-up" | "easy" | "medium" | "hard";
    kind: "feature" | "bug" | "performance" | "refactor";
    language: string;
    skills: string[];
    task: string;
    inputs: unknown[];
    expected: unknown[];
    hints?: string[];
    comments?: Comment[];
  },
) => ({
  id,
  version: "1.0.0",
  assessment_version: "1.0.0",
  hints: [],
  ...fields,
  ...STARTERS[id],
  ...(fields.language === "python" ? { runtime: PYODIDE } : {}),
});

/**
 * The file each issue opens in the IDE: an entry point and starter code in the issue's own
 * language, written like the file you would find at work. Python ones also name the runtime,
 * which makes them runnable in the browser; the rest are editable until a runner exists.
 */
const PYODIDE = { id: "pyodide", python: "3.14.2", version: "314.0.7" };
const STARTERS: Record<string, { entrypoint: string; starter: string }> = {
  "format-price": {
    entrypoint: "formatPrice",
    starter: `/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  return \`\${cents}\`;
}
`,
  },
  "discount-codes": {
    entrypoint: "applyDiscount",
    starter: `/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const percent = codes[code];
  if (percent === undefined) return totalCents;
  return Math.floor(totalCents * (100 - percent) / 100);
}
`,
  },
  "filter-form-labels": {
    entrypoint: "render",
    starter: `<!--
  Product filters on the category page. Render one checkbox per filter name,
  each with a label tied to it, all inside the form.
-->
<form>
  <input type="checkbox" name="in-stock"> in-stock
  <input type="checkbox" name="on-sale"> on-sale
</form>
`,
  },
  "debounce-search": {
    entrypoint: "debounceTimes",
    starter: `/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  return keystrokes.map((time) => time + waitMs);
}
`,
  },
  "pagination-params": {
    entrypoint: "ParsePage",
    starter: `package accounts

// Page is the pagination requested by a list endpoint.
type Page struct {
	Page    int \`json:"page"\`
	PerPage int \`json:"perPage"\`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
	return Page{Page: 1, PerPage: 20}
}
`,
  },
  "reset-link-expiry": {
    entrypoint: "isExpired",
    starter: `<?php

declare(strict_types=1);

/**
 * Whether a password reset link has expired. Timestamps are Unix seconds;
 * a link stays valid until $issuedAt + $ttlMinutes * 60, inclusive.
 */
function isExpired(int $issuedAt, int $now, int $ttlMinutes): bool
{
    return $now > $issuedAt + $ttlMinutes;
}
`,
  },
  "rate-limiter": {
    entrypoint: "allow",
    starter: `/**
 * For each login attempt time, whether it is allowed: at most \`limit\` attempts
 * may fall inside any window of \`windowMs\` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  return times.map(() => true);
}
`,
  },
  "parse-log-line": {
    entrypoint: "ParseLine",
    starter: `package accesslog

// Entry is one line of the access log.
type Entry struct {
	Method string \`json:"method"\`
	Path   string \`json:"path"\`
	Status int    \`json:"status"\`
	Ms     int    \`json:"ms"\`
}

// ParseLine parses lines like "GET /cart 200 12ms".
func ParseLine(line string) Entry {
	return Entry{}
}
`,
  },
  "csv-quoted-fields": {
    entrypoint: "parse_csv_line",
    starter: `def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    return line.split(",")
`,
  },
  "dedupe-customers": {
    entrypoint: "dedupe",
    starter: `def dedupe(records):
    """Keep the first record for each email before the newsletter sync.

    Emails compare case-insensitively, ignoring surrounding spaces. Order is kept.
    """
    return records
`,
  },
  "top-customers": {
    entrypoint: "query",
    starter: `-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, total
FROM orders;
`,
  },
  "unpaid-orders": {
    entrypoint: "query",
    starter: `-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT id
FROM orders;
`,
  },
  "ring-buffer": {
    entrypoint: "ring_buffer",
    starter: `#include <stddef.h>

/*
 * Keeps the last \`capacity\` request latencies. Push each value in order, then
 * write the contents oldest first into \`out\` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    (void)capacity;
    (void)values;
    (void)count;
    (void)out;
    return 0;
}
`,
  },
  "p99-latency": {
    entrypoint: "percentile",
    starter: `/// Nearest-rank percentile of the samples: sort them and take the value at
/// rank ceil(p / 100 × n), counting from 1. None when there are no samples.
pub fn percentile(samples: &[u32], p: f64) -> Option<u32> {
    let _ = (samples, p);
    None
}
`,
  },
  "lru-cache": {
    entrypoint: "simulate",
    starter: `#include <string>
#include <vector>

// One cache operation: {"put", key, value} or {"get", key}.
struct Op {
    std::string name;
    int key;
    int value;
};

// Runs the operations against an LRU cache of the given capacity and returns
// the result of each get, -1 for a miss. A get counts as a use.
std::vector<int> simulate(int capacity, const std::vector<Op>& ops) {
    std::vector<int> results;
    return results;
}
`,
  },
  "parse-duration": {
    entrypoint: "parse_duration",
    starter: `/// Parses durations like "1h30m", "45s" or "2h" into seconds. Units are h, m
/// and s, each at most once and in that order; anything else is None.
pub fn parse_duration(text: &str) -> Option<u64> {
    let _ = text;
    None
}
`,
  },
};

// Recurring teammates, so threads read like one team.
const ada = (body: string): Comment => ({
  author: "Ada N",
  role: "Frontend",
  body,
});
const lena = (body: string): Comment => ({
  author: "Lena M",
  role: "Product",
  body,
});
const mateo = (body: string): Comment => ({
  author: "Mateo O",
  role: "Backend",
  body,
});
const priya = (body: string): Comment => ({
  author: "Priya K",
  role: "Data",
  body,
});
const sam = (body: string): Comment => ({ author: "Sam R", role: "SRE", body });
const jo = (body: string): Comment => ({
  author: "Jo T",
  role: "Support",
  body,
});
const rui = (body: string): Comment => ({
  author: "Rui F",
  role: "Finance",
  body,
});

const challenges = [
  // Storefront: frontend
  challenge("format-price", {
    title: "Cart shows prices as raw cents",
    summary: "Format amounts as dollars with separators, including refunds.",
    kind: "bug",
    difficulty: "warm-up",
    language: "javascript",
    skills: ["formatting", "strings", "numbers"],
    task: 'Write `formatPrice(cents)`: return the amount in dollars with two decimals and comma thousands separators, e.g. `123456` → `"$1,234.56"`. Negative amounts are refunds and get a leading minus: `-500` → `"-$5.00"`.',
    inputs: [123456, 5, 0, -500, 100000000],
    expected: ["$1,234.56", "$0.05", "$0.00", "-$5.00", "$1,000,000.00"],
    comments: [
      ada(
        "Design wants the minus before the dollar sign for refunds, same as on the receipts.",
      ),
    ],
  }),
  challenge("discount-codes", {
    title: "Discount codes fail when typed in lowercase",
    summary: "Match promo codes case-insensitively and ignore stray spaces.",
    kind: "bug",
    difficulty: "easy",
    language: "typescript",
    skills: ["strings", "validation"],
    task: "`applyDiscount(totalCents, code, codes)` returns the total after the matching code's percentage off, rounded down to whole cents. Codes match case-insensitively and ignoring surrounding spaces; an unknown code leaves the total unchanged.",
    inputs: [
      [10000, "save10", { SAVE10: 10 }],
      [10000, " SAVE10 ", { SAVE10: 10 }],
      [999, "HALF", { HALF: 50 }],
      [5000, "NOPE", { SAVE10: 10 }],
    ],
    expected: [9000, 9000, 499, 5000],
    comments: [
      jo(
        "40 tickets this morning. People type codes the way they read them in the email.",
      ),
      lena("Black Friday is in two weeks, so this one jumps the queue."),
    ],
  }),
  challenge("filter-form-labels", {
    title: "Product filter checkboxes have no labels",
    summary: "Tie every filter checkbox to a label so it is accessible.",
    kind: "refactor",
    difficulty: "warm-up",
    language: "html",
    skills: ["accessibility", "forms", "semantics"],
    task: 'Render the product filter form: for each filter name, a `<label for="filter-NAME">` with the name as text, followed by `<input type="checkbox" id="filter-NAME" name="NAME">`, all inside a `<form>`.',
    inputs: [["in-stock", "on-sale"], []],
    expected: [
      '<form><label for="filter-in-stock">in-stock</label><input type="checkbox" id="filter-in-stock" name="in-stock"><label for="filter-on-sale">on-sale</label><input type="checkbox" id="filter-on-sale" name="on-sale"></form>',
      "<form></form>",
    ],
    comments: [
      ada(
        "The accessibility audit flagged every checkbox here. Clicking the text should toggle the box.",
      ),
    ],
  }),
  challenge("debounce-search", {
    title: "Search box sends a request on every keystroke",
    summary:
      "Debounce search-as-you-type so the API sees one request per pause.",
    kind: "performance",
    difficulty: "medium",
    language: "typescript",
    skills: ["timing", "events"],
    task: "`debounceTimes(keystrokes, waitMs)`: given keystroke times in milliseconds, return the times at which the debounced search fires. It fires `waitMs` after a keystroke unless another keystroke comes first.",
    inputs: [
      [[0, 100, 200, 1000], 300],
      [[], 300],
      [[0, 500], 300],
    ],
    expected: [[500, 1300], [], [300, 800]],
    hints: [
      "Each keystroke cancels the pending request if it arrives before the timer fires.",
    ],
    comments: [
      sam(
        "Search API gets about eight requests per query. 300 ms after the last keystroke is plenty.",
      ),
    ],
  }),

  // Accounts API: backend
  challenge("pagination-params", {
    title: "List endpoints accept any page size",
    summary: "Parse page and per_page with defaults and a hard cap.",
    kind: "bug",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "validation", "http"],
    task: "`ParsePage(query)` reads `page` and `per_page` from a URL query string. Defaults are page 1 and 20 per page, `per_page` is capped at 100, and missing, zero, negative or non-numeric values fall back to the default.",
    inputs: ["page=2&per_page=50", "", "per_page=500", "page=-1&per_page=abc"],
    expected: [
      { page: 2, perPage: 50 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 100 },
      { page: 1, perPage: 20 },
    ],
    comments: [
      mateo(
        "The mobile app sends per_page=500 to fetch everything in one go. Cap it, don't error.",
      ),
    ],
  }),
  challenge("reset-link-expiry", {
    title: "Password reset links expire after a minute",
    summary: "The TTL is in minutes but the check compares seconds.",
    kind: "bug",
    difficulty: "easy",
    language: "php",
    skills: ["time", "units"],
    task: "`isExpired(issuedAt, now, ttlMinutes)` with Unix timestamps in seconds. A link issued at t stays valid until `t + ttlMinutes × 60`, inclusive.",
    inputs: [
      [1000, 1059, 60],
      [1000, 4600, 60],
      [1000, 4601, 60],
      [1000, 1000, 0],
    ],
    expected: [false, false, true, false],
    comments: [
      jo(
        "Customers say reset emails 'never work'. They do, if you click within a minute.",
      ),
    ],
  }),
  challenge("rate-limiter", {
    title: "Rate-limit login attempts",
    summary: "Allow at most n attempts in any sliding window.",
    kind: "feature",
    difficulty: "medium",
    language: "typescript",
    skills: ["sliding-window", "queues"],
    task: "Write `allow(times, limit, windowMs)`: for each login attempt time, return whether it is allowed when at most `limit` attempts may fall inside any window of `windowMs` milliseconds.",
    inputs: [
      [[0, 1, 2, 3], 3, 10],
      [[], 1, 10],
      [[0, 10, 20], 1, 10],
    ],
    expected: [[true, true, true, false], [], [true, true, true]],
    hints: ["Keep only the timestamps still inside the window."],
    comments: [
      sam(
        "Credential-stuffing bot again last night. A sliding window per IP, nothing fancy.",
      ),
    ],
  }),
  challenge("parse-log-line", {
    title: "Access log parser drops fields on 5xx lines",
    summary: "Turn an access log line into a structured record.",
    kind: "bug",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "strings"],
    task: 'Write `ParseLine(line)` for lines like `GET /cart 200 12ms`, returning method, path, status and duration in milliseconds.',
    inputs: ["GET /cart 200 12ms", "POST /pay 502 1300ms"],
    expected: [
      { method: "GET", path: "/cart", status: 200, ms: 12 },
      { method: "POST", path: "/pay", status: 502, ms: 1300 },
    ],
    comments: [
      sam(
        "Alerting is blind to the 502s because duration and status come back empty.",
      ),
      priya("Durations are always whole milliseconds, suffixed with ms."),
    ],
  }),

  // Data platform: imports, cleaning and reports
  challenge("csv-quoted-fields", {
    title: "CSV import splits company names on commas",
    summary: "Respect quoted fields when parsing partner exports.",
    kind: "bug",
    difficulty: "easy",
    language: "python",
    skills: ["parsing", "strings", "csv"],
    task: '`parse_csv_line(line)` splits a CSV line on commas, except inside double quotes. Quotes are removed, and a doubled quote inside a quoted field is a literal quote: `"say ""hi"""` → `say "hi"`.',
    inputs: ["a,b,c", '"Acme, Inc.",42,"NY"', '"say ""hi""",x', ""],
    expected: [
      ["a", "b", "c"],
      ["Acme, Inc.", "42", "NY"],
      ['say "hi"', "x"],
      [""],
    ],
    comments: [
      priya(
        "Every customer with a comma in their company name lands in the wrong column. 'Acme, Inc.' is our biggest account.",
      ),
    ],
  }),
  challenge("dedupe-customers", {
    title: "Deduplicate customer records by email",
    summary: "Keep the first record per email before the newsletter sync.",
    kind: "feature",
    difficulty: "medium",
    language: "python",
    skills: ["maps", "data-cleaning"],
    task: "`dedupe(records)` keeps the first record for each email, comparing emails case-insensitively and ignoring surrounding spaces. Keep the original order.",
    inputs: [
      [
        { id: 1, email: "Ann@x.io" },
        { id: 2, email: " ann@x.io" },
        { id: 3, email: "bo@x.io" },
      ],
      [],
    ],
    expected: [
      [
        { id: 1, email: "Ann@x.io" },
        { id: 3, email: "bo@x.io" },
      ],
      [],
    ],
    comments: [
      lena(
        "Marketing sent last week's newsletter three times to some people. They were not thrilled.",
      ),
    ],
  }),
  challenge("top-customers", {
    title: "Revenue by customer for the monthly report",
    summary: "Total each customer's orders, biggest first.",
    kind: "feature",
    difficulty: "easy",
    language: "sql",
    skills: ["aggregation", "sorting"],
    task: "Given `orders(id, customer, total)`, select each customer and the sum of their totals, highest first.",
    inputs: [
      {
        orders: [
          [1, "ana", 30],
          [2, "bo", 10],
          [3, "ana", 5],
        ],
      },
    ],
    expected: [
      [
        ["ana", 35],
        ["bo", 10],
      ],
    ],
    comments: [
      rui("Just the totals per customer, biggest first. The chart is my job."),
    ],
  }),
  challenge("unpaid-orders", {
    title: "Find orders with no matching payment",
    summary: "Reconcile orders against payments before month-end close.",
    kind: "feature",
    difficulty: "medium",
    language: "sql",
    skills: ["joins", "reconciliation"],
    task: "Given `orders(id, customer)` and `payments(order_id, amount)`, select the ids of orders that have no payment, smallest first.",
    inputs: [
      {
        orders: [
          [1, "ana"],
          [2, "bo"],
          [3, "cy"],
        ],
        payments: [
          [1, 30],
          [3, 12],
        ],
      },
    ],
    expected: [[[2]]],
    hints: ["A LEFT JOIN keeps orders even when no payment matches."],
    comments: [rui("Month-end close is Friday. I need this list before then.")],
  }),

  // Edge proxy: systems and performance
  challenge("ring-buffer", {
    title: "Keep the last N request latencies in memory",
    summary: "A fixed-size buffer that overwrites its oldest entry.",
    kind: "feature",
    difficulty: "medium",
    language: "c",
    skills: ["arrays", "modular-arithmetic"],
    task: "Implement a ring buffer of capacity `n`. Given a sequence of pushes, return the contents oldest first.",
    inputs: [
      [3, [1, 2, 3, 4]],
      [2, []],
    ],
    expected: [[2, 3, 4], []],
    comments: [
      sam("No malloc on the hot path. Fixed-size array, overwrite the oldest."),
    ],
  }),
  challenge("p99-latency", {
    title: "p99 latency panel times out in busy hours",
    summary: "Compute nearest-rank percentiles for the metrics endpoint.",
    kind: "performance",
    difficulty: "medium",
    language: "rust",
    skills: ["sorting", "statistics"],
    task: "`percentile(samples, p)` returns the nearest-rank percentile: sort the samples and take the value at rank `ceil(p / 100 × n)`, counting from 1. Return `null` when there are no samples.",
    inputs: [
      [[15, 20, 35, 40, 50], 30],
      [[15, 20, 35, 40, 50], 100],
      [[], 99],
      [[5], 99],
    ],
    expected: [20, 50, null, 5],
    comments: [
      sam(
        "The current version re-sorts every sample for every percentile. Busy hours have two million samples.",
      ),
    ],
  }),
  challenge("lru-cache", {
    title: "Cache evicts entries that were just used",
    summary: "Reads must refresh recency in the LRU cache.",
    kind: "bug",
    difficulty: "hard",
    language: "cpp",
    skills: ["caching", "linked-lists", "maps"],
    task: 'Simulate an LRU cache with the given capacity over operations `["put", key, value]` and `["get", key]`. Return the results of the gets in order, `-1` for a miss. A get counts as a use.',
    inputs: [
      [
        2,
        [
          ["put", 1, 1],
          ["put", 2, 2],
          ["get", 1],
          ["put", 3, 3],
          ["get", 2],
          ["get", 1],
        ],
      ],
      [
        1,
        [
          ["put", 1, 1],
          ["put", 2, 2],
          ["get", 1],
        ],
      ],
    ],
    expected: [[1, -1, 1], [-1]],
    hints: ["Pair a hash map with a doubly linked list ordered by last use."],
    comments: [
      mateo(
        "Hit rate dropped to 12% after the last deploy. I think get() stopped refreshing recency.",
      ),
    ],
  }),
  challenge("parse-duration", {
    title: "Timeouts in config must be written in seconds",
    summary: "Accept durations like 1h30m in config files.",
    kind: "feature",
    difficulty: "easy",
    language: "rust",
    skills: ["parsing", "config"],
    task: '`parse_duration(text)` turns strings like `"1h30m"`, `"45s"` or `"2h"` into seconds. Units are `h`, `m` and `s`, each at most once and in that order; return `null` for anything else.',
    inputs: ["1h30m", "45s", "2h", "1h1h", "90", ""],
    expected: [5400, 45, 7200, null, null, null],
    comments: [
      sam(
        "Somebody set idle_timeout = 3600 meaning minutes. Let people write 1h.",
      ),
    ],
  }),
];

const adventures = [
  {
    id: "storefront",
    key: "SHOP",
    title: "Storefront",
    summary: "Frontend: the customer-facing shop, cart and checkout.",
    story: `The online shop customers actually see: product listings, filters, the cart and a three-step checkout. Pages are server-rendered, with a thin layer of TypeScript for the interactive parts.

Conversion dipped after the last redesign. Support is fielding tickets about prices, promo codes and a search box that feels sluggish, and an accessibility audit came back with a long list.

## What you'll work on

- Formatting money and other values the way customers expect to read them
- Form behaviour, validation and accessible markup
- Small performance fixes in the browser, like debouncing input

## Good fit if you

- Build user interfaces, or want to get sharper at the details that make one feel solid
- Are comfortable with **JavaScript**, **TypeScript** or plain **HTML**
- Care what a bug looks like from the customer's side of the screen

Stack: TypeScript, JavaScript, HTML.`,
    challenges: [
      "format-price",
      "discount-codes",
      "filter-form-labels",
      "debounce-search",
    ],
  },
  {
    id: "accounts-api",
    key: "API",
    title: "Accounts API",
    summary: "Backend: sign-up, login and account endpoints behind every app.",
    story: `The service every client talks to for sign-up, login, sessions and password resets. Most of it is Go, a few older endpoints are still PHP, and the login gateway in front is TypeScript.

It mostly works, and the on-call channel has opinions about the rest: list endpoints that accept any page size, reset links that expire too soon, and logs that are hard to search during an incident.

## What you'll work on

- Parsing and validating request parameters with sensible defaults
- Time and expiry logic, where off-by-one and unit mix-ups hide
- Rate limiting and log handling for the people on call

## Good fit if you

- Write backend services, or want practice with the bugs they actually get
- Like **input validation**, edge cases and reading a stack trace at 2am
- Know **Go**, **PHP** or **TypeScript**, or want to try one of them on familiar problems

Stack: Go, PHP, TypeScript.`,
    challenges: [
      "pagination-params",
      "reset-link-expiry",
      "rate-limiter",
      "parse-log-line",
    ],
  },
  {
    id: "data-platform",
    key: "DATA",
    title: "Data platform",
    summary:
      "Data: nightly partner imports, cleaning and the reports finance relies on.",
    story: `Partners drop CSV exports in a bucket every night. A pipeline cleans them, loads the warehouse and feeds the reports finance reads on Monday morning.

The exports are messier than anyone admits: quoted commas in company names, duplicate customers with slightly different emails, and orders that never got paid. When the numbers look wrong, this is where people come asking.

## What you'll work on

- Parsing awkward input files without losing data
- Cleaning and deduplicating records before they reach the warehouse
- SQL for the reports and reconciliations people rely on

## Good fit if you

- Work with data, or are the person on your team who ends up writing the SQL
- Enjoy turning messy input into something you can trust
- Know **Python** and **SQL**, or want more practice with both

Stack: Python, SQL.`,
    challenges: [
      "csv-quoted-fields",
      "dedupe-customers",
      "top-customers",
      "unpaid-orders",
    ],
  },
  {
    id: "edge-proxy",
    key: "EDGE",
    title: "Edge proxy",
    summary: "Systems: the low-latency proxy in front of everything.",
    story: `A small proxy in front of everything: it terminates connections, caches hot responses and exports latency metrics. It's written in C, C++ and Rust, depending on who wrote which part and when.

Every allocation shows up on a flame graph here. The backlog is about doing more with fixed memory, measuring the right thing, and keeping configuration readable for whoever is paged.

## What you'll work on

- Fixed-size data structures such as ring buffers and LRU caches
- Latency percentiles and the metrics behind dashboards
- Small, strict configuration formats

## Good fit if you

- Do systems or performance work, or want to get closer to the metal
- Think about memory, ordering and what happens under load
- Know **C**, **C++** or **Rust**, or are learning one of them

Stack: C, C++, Rust.`,
    challenges: ["ring-buffer", "p99-latency", "lru-cache", "parse-duration"],
  },
].map(({ challenges: ids, ...adventure }) => ({
  ...adventure,
  version: "1.0.0",
  presentation: "demo-text-v1",
  challenges: ids.map((id) => [id, "1.0.0"]),
}));

const at = "2026-10-24T00:00:00.000Z"; // Synthetic, deterministic across builds.
let catalog = emptyCatalog();
// Issue numbers follow each project's order at first publication and never change.
const numberOf = new Map(
  adventures.flatMap((a) =>
    a.challenges.map(([id], i) => [id, i + 1] as const),
  ),
);
for (const [kind, content] of [
  ...challenges.map(
    (c) => ["challenge", { ...c, number: numberOf.get(c.id) }] as const,
  ),
  ...adventures.map((a) => ["adventure", a] as const),
]) {
  const ref: ContentRef = { kind, id: content.id, version: content.version };
  catalog = saveDraft(catalog, kind, content, at);
  catalog = publish(markTested(preview(catalog, ref, at), ref, at), ref, at);
}
verifyCatalog(catalog);
const destination = resolve("content/demo/catalog.json");
const text = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== text)
    throw new Error(
      "Demo catalog is out of date. Run npm run build:demo-catalog.",
    );
  console.log("Demo catalog is current.");
} else {
  await mkdir(resolve("content/demo"), { recursive: true });
  await writeFile(destination, text);
}
