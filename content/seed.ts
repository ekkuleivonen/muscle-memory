/**
 * Seed content: the projects and issues the app starts with, written the way the admin system
 * will store them later. Five projects, one per engineering area plus a warm-up, with the kind
 * of issues people meet in a normal job. tools/build-content.ts turns this into the catalog
 * (content/catalog.json): it generates each issue's repo and hashes each revision.
 *
 * An issue's `private` part (reference solution, trigger examples) is for publish checks only:
 * it is never written to the catalog, and nothing the app ships imports this file.
 */
import type { Trigger } from "../packages/content/model";

/** A note in the ticket's own thread, there when the issue is opened. */
export type Comment = { author: string; role: string; body: string };

/** A teammate's later comment, on the ticket or in a pull request review, with its trigger. */
export interface SeedTeamComment {
  id: string;
  author: string;
  role: string;
  where: "issue" | "review";
  severity: "blocking" | "nit" | "info";
  /** A few wordings of the same comment; each person sees one. */
  text: string[];
  when: Trigger;
  repeat?: "once" | "while-true";
}

/** A hint: an idea, never solution code. A plain string waits for active minutes. */
export type SeedHint = string | { text: string; when: Trigger };

export interface SeedIssue {
  id: string;
  title: string;
  summary: string;
  difficulty: "warm-up" | "easy" | "medium" | "hard";
  kind: "feature" | "bug" | "performance" | "refactor";
  language: string;
  skills: string[];
  task: string;
  inputs: unknown[];
  expected: unknown[];
  /** Released one at a time, in order, by the lead of the ticket's thread. */
  hints: SeedHint[];
  comments: Comment[];
  /** Later comments released by triggers: on the ticket, or reviewing a pull request. */
  team?: SeedTeamComment[];
  entrypoint: string;
  starter: string;
  /** Named when each input lists several arguments; otherwise it is the only one. */
  parameters?: string[];
  /** SQL: the tables each case's rows go into. */
  schema?: string;
  /** C, C++ and Java: turns a case's JSON arguments into the function's types. */
  adapter?: string;
  /** JavaScript and TypeScript: where the entry file lives, when not src/<entry point>. */
  entry?: string;
  /** More of the repo: source the code uses but may not change (read), and documents (docs). */
  files?: SeedFile[];
  /** Cases left out of the repo's test file, by index: only CI runs them. */
  hidden?: number[];
  private?: SeedPrivate;
}

export interface SeedFile {
  path: string;
  role: "read" | "docs";
  language: string;
  text: string;
}

/** Never published. Publish checks use it (tools/build-content.ts, tools/browser/content-check.ts). */
export interface SeedPrivate {
  /** The editable files after a correct fix, by path: it must pass every case. */
  reference: Record<string, string>;
  /**
   * Per teammate comment: changes to the editable files that must fire it, and changes that
   * must not. Every blocking review comment needs both.
   */
  examples?: Record<string, { fires: Record<string, string>[]; quiet: Record<string, string>[] }>;
}

export interface SeedProject {
  id: string;
  key: string;
  title: string;
  summary: string;
  story: string;
  /** Issue ids in board order; an issue's number is its position here, from 1. */
  issues: string[];
  /** False keeps the project out of lists and suggestions (see Project.listed). */
  listed?: boolean;
}

const challenge = (
  id: string,
  fields: Omit<SeedIssue, "id" | "hints" | "comments" | "entrypoint" | "starter"> & {
    hints?: SeedHint[];
    comments?: Comment[];
  },
): SeedIssue => ({
  id,
  hints: [],
  comments: [],
  ...fields,
  ...STARTERS[id],
});

/**
 * The file each issue opens in the IDE: an entry point and starter code in the issue's own
 * language, written like the file you would find at work. Whether it runs in the browser is
 * up to the app's runners, not the content.
 */
const STARTERS: Record<string, { entrypoint: string; starter: string }> = {
  "word-count-php": {
    entrypoint: "countWords",
    starter: `<?php

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return substr_count($text, " ") + 1;
}
`,
  },
  "word-count-ruby": {
    entrypoint: "count_words",
    starter: `# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.count(" ") + 1
end
`,
  },
  "word-count-csharp": {
    entrypoint: "Count",
    starter: `namespace Composer;

/// <summary>The word count the composer shows under the text box.</summary>
public static class WordCount
{
    /// <summary>The number of words in a post.</summary>
    public static int Count(string text)
    {
        return text.Split(' ').Length;
    }
}
`,
  },
  "word-count-java": {
    entrypoint: "count",
    starter: `package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        return text.split(" ").length;
    }
}
`,
  },
  "word-count-go": {
    entrypoint: "CountWords",
    starter: `package composer

import "strings"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	return strings.Count(text, " ") + 1
}
`,
  },
  "word-count-typescript": {
    entrypoint: "countWords",
    starter: `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return text.split(" ").length;
}
`,
  },
  "word-count-javascript": {
    entrypoint: "countWords",
    starter: `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.split(" ").length;
}
`,
  },
  "word-count-python": {
    entrypoint: "count_words",
    starter: `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return text.count(" ") + 1
`,
  },
  "frequency-map": {
    entrypoint: "frequency_map",
    starter: `def frequency_map(items):
    counts = {}
    # Count each item.
    return counts
`,
  },
  "password-policy": {
    entrypoint: "violations",
    starter: `package com.acme.accounts;

import java.util.ArrayList;
import java.util.List;

/** The password rules sign-up and password reset enforce. */
public final class PasswordPolicy {
    private PasswordPolicy() {}

    /**
     * The rules a password breaks, in this order: too-short, no-digit, no-letter,
     * has-whitespace. Empty when it passes.
     */
    public static List<String> violations(String password) {
        List<String> broken = new ArrayList<>();
        if (password.length() < 8) broken.add("too-short");
        return broken;
    }
}
`,
  },
  "late-fee-rounding": {
    entrypoint: "LateFee",
    starter: `namespace Billing;

public static class LateFees
{
    /// <summary>
    /// The late fee on an overdue invoice: 0.5% of the balance per day late, at most 10% of
    /// the balance, in cents. Finance rounds halves away from zero.
    /// </summary>
    public static decimal LateFee(decimal balance, int daysLate)
    {
        if (daysLate <= 0) return 0;
        var fee = balance * 0.005m * daysLate;
        return Math.Round(Math.Min(fee, balance * 0.10m), 2);
    }
}
`,
  },
  "workspace-slugs": {
    entrypoint: "slugify",
    starter: `# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  name.downcase.tr(" ", "-")
end
`,
  },
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
    entrypoint: "page",
    starter: `<!--
  Product filters on the category page. The accessibility audit flagged these
  checkboxes: each needs a label tied to it.
-->
<form>
  <input type="checkbox" name="in-stock"> in-stock
  <input type="checkbox" name="on-sale"> on-sale
</form>
`,
  },
  "refund-totals": {
    entrypoint: "refundTotal",
    starter: `import { discountFor } from "./discounts.js";
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
  const returned = sum(refund.lines.map(lineTotal));
  return -(returned - discountFor(refund.code, returned));
}
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
    entrypoint: "Percentile",
    starter: `package metrics

import "sort"

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
	sorted := append([]int(nil), samples...)
	sort.Ints(sorted)
	return 0, false
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
    entrypoint: "ParseDuration",
    starter: `package config

import "errors"

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	return 0, errors.New("not implemented")
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

export const SEED_ISSUES: SeedIssue[] = [
  // Quick fixes: five-minute bugs, one per language, for /play
  challenge("word-count-python", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "python",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`count_words(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "count_words.py": `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(text.split())
` },
    },
  }),
  challenge("word-count-javascript", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "javascript",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`countWords(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.split(/\\s+/).filter(Boolean).length;
}
` },
    },
  }),
  challenge("word-count-typescript", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "typescript",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`countWords(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/count-words.ts": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return text.split(/\\s+/).filter(Boolean).length;
}
` },
    },
  }),
  challenge("word-count-go", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "go",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`CountWords(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "count_words.go": `package composer

import "strings"

// CountWords is the number of words in a post, as the composer shows it under the text box.
func CountWords(text string) int {
	return len(strings.Fields(text))
}
` },
    },
  }),
  challenge("word-count-java", {
    adapter: `import com.acme.composer.WordCount;

/** [text] → its word count. */
final class Adapter {
    static Object call(Json args) {
        return WordCount.count(args.at(0).asString());
    }
}
`,
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "java",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`WordCount.count(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/main/java/com/acme/composer/WordCount.java": `package com.acme.composer;

/** The word count the composer shows under the text box. */
public final class WordCount {
    private WordCount() {}

    /** The number of words in a post. */
    public static int count(String text) {
        String trimmed = text.strip();
        return trimmed.isEmpty() ? 0 : trimmed.split("\\\\s+").length;
    }
}
` },
    },
  }),
  challenge("word-count-csharp", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "csharp",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`WordCount.Count(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/WordCount.cs": `namespace Composer;

/// <summary>The word count the composer shows under the text box.</summary>
public static class WordCount
{
    /// <summary>The number of words in a post.</summary>
    public static int Count(string text)
    {
        return text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length;
    }
}
` },
    },
  }),
  challenge("word-count-ruby", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "ruby",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`count_words(text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "lib/count_words.rb": `# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.split.length
end
` },
    },
  }),
  challenge("word-count-php", {
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "warm-up",
    language: "php",
    skills: ["strings", "edge-cases"],
    task: `Writers keep emailing support: an empty post says **1 word**, and a post with a double space counts an extra one.

\`countWords($text)\` is the count the composer shows under the text box. Words are separated by any run of spaces, tabs or newlines, and an empty or blank post has 0 words.`,
    inputs: ["", "hello world", "  spaced   out  ", "one", "tabs\tand\nnew lines"],
    expected: [0, 2, 2, 1, 4],
    hidden: [4],
    comments: [
      lena("An empty post says 1 word. Writers have noticed, and they're writers, so they've noticed loudly."),
    ],
    hints: [
      {
        text: "What does your function return for an empty post, and where does that number come from?",
        when: { behaviour: "active-minutes-without-progress", atLeast: 3 },
      },
      {
        text: "Splitting on one space keeps an empty piece between two spaces. Is there a way to split on any run of whitespace?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    team: [
      {
        id: "lena-shipped",
        author: "Lena M",
        role: "Product",
        where: "review",
        severity: "info",
        text: ["Lovely, that's the one. Empty posts say 0 words again."],
        when: { check: "case-1", is: "passing" },
      },
    ],
    private: {
      reference: { "src/countWords.php": `<?php

declare(strict_types=1);

/** The number of words in a post, as the composer shows it under the text box. */
function countWords(string $text): int
{
    return count(preg_split('/\\s+/', $text, -1, PREG_SPLIT_NO_EMPTY));
}
` },
    },
  }),
  // Field notes: a warm-up
  challenge("frequency-map", {
    title: "Frequency map",
    summary: "Count every exact, case-sensitive label in a list.",
    kind: "feature",
    difficulty: "warm-up",
    language: "python",
    skills: ["iteration", "maps", "edge-cases"],
    task: "Write `frequency_map(items)`: count each exact, case-sensitive string and return a dict of string to integer count. Empty input returns `{}`.",
    inputs: [["a", "b", "a"], [], ["A", "a", "A"], ["__proto__", "__proto__", "x"]],
    expected: [{ a: 2, b: 1 }, {}, { A: 2, a: 1 }, JSON.parse('{"__proto__":2,"x":1}')],
    hints: [
      "A dict can hold one counter for each distinct string.",
      {
        text: "Try the `__proto__` case by hand: what does your dict hold after the first label, and after the second?",
        when: { behaviour: "failing-pushes", atLeast: 2 },
      },
    ],
    comments: [
      priya(
        "Heads up: the scanner sometimes emits odd labels like __proto__. Please don't special-case anything; every label is just a string.",
      ),
    ],
    team: [
      {
        id: "priya-debug-print",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: [
          "Could you take the `print` out before this goes in? The scanner job ships everything on stdout to the warehouse logs.",
          "There's a `print` left in here. Anything on stdout ends up in the warehouse logs, so it needs to go before we merge.",
        ],
        when: { pattern: "^\\s*print\\(", present: true },
        repeat: "while-true",
      },
      {
        id: "priya-long-function",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "nit",
        text: [
          "Nit: `frequency_map` has grown quite long for what it does. Could the dict itself do more of the work?",
        ],
        when: { metric: "function-lines", above: 12 },
      },
      {
        id: "priya-proto-passes",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "info",
        text: ["Nice, `__proto__` comes through as a plain label now. That was the one breaking the nightly run."],
        when: { check: "case-4", is: "passing" },
      },
    ],
    private: {
      reference: { "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return counts
` },
      examples: {
        "priya-debug-print": {
          fires: [{ "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    print(counts)
    return counts
` }],
          quiet: [{ "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return counts
` }],
        },
      },
    },
  }),
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
    parameters: ["totalCents", "code", "codes"],
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
    parameters: ["selector", "read"],
    title: "Product filter checkboxes have no labels",
    summary: "Tie every filter checkbox to a label so it is accessible.",
    kind: "refactor",
    difficulty: "warm-up",
    language: "html",
    skills: ["accessibility", "forms", "semantics"],
    task: 'The category page\'s filter form has two checkboxes, `in-stock` and `on-sale`, with bare text next to them, so screen readers announce "checkbox" and nothing else. Give each checkbox the id `filter-NAME` and a `<label for="filter-NAME">` with its name as the text. Keep the `name` attributes, and keep everything inside the `<form>`. The checks query the page like the frontend tests do: each one is a CSS selector and what to read from the matches (their count, text, accessible label or an attribute).',
    inputs: [
      ["form input[type=checkbox]", "name"],
      ["form input[type=checkbox]", "id"],
      ["form input[type=checkbox]", "label"],
      ["form label", "text"],
    ],
    expected: [
      ["in-stock", "on-sale"],
      ["filter-in-stock", "filter-on-sale"],
      ["in-stock", "on-sale"],
      ["in-stock", "on-sale"],
    ],
    comments: [
      ada(
        "The accessibility audit flagged every checkbox here. Clicking the text should toggle the box.",
      ),
    ],
  }),
  challenge("debounce-search", {
    parameters: ["keystrokes", "waitMs"],
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

  challenge("refund-totals", {
    title: "Refund totals double-count discounts",
    summary: "Refunds on orders with a promo code give back less than the customer paid.",
    kind: "bug",
    difficulty: "medium",
    language: "javascript",
    skills: ["debugging", "money", "reading-code"],
    task: `Support escalated this from the help desk:

> A customer returned one of two jackets from an order that used **SPRING10** (10% off). The receipt says they paid **$45.00** for that jacket, but the refund came through as **$40.50**.

\`\`\`text
Order #10482    SPRING10 (10% off)
  Rain jacket    1 × $50.00    −$5.00    $45.00
Refund #R-2291
  Rain jacket    1 × $50.00              −$40.50
\`\`\`

\`refundTotal(refund)\` in \`src/cart/totals.js\` works out what a refund gives back, in cents, as a negative amount. A refund gives back exactly what the customer paid for the lines returned. Checkout totals are not part of this ticket.`,
    entry: "src/cart/totals.js",
    files: [
      { path: "src/cart/money.js", role: "read", language: "javascript", text: `/** Money is whole cents everywhere: never floats. */

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
` },
      { path: "src/cart/discounts.js", role: "read", language: "javascript", text: `import { sum } from "./money.js";

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
` },
    ],
    inputs: [
      { code: null, lines: [{ sku: "tee", price: 2500, quantity: 2, discount: 0 }] },
      { code: { percent: 10 }, lines: [{ sku: "rain-jacket", price: 5000, quantity: 1, discount: 500 }] },
      {
        code: { amount: 1000 },
        lines: [
          { sku: "boots", price: 3000, quantity: 1, discount: 600 },
          { sku: "socks", price: 2000, quantity: 1, discount: 400 },
        ],
      },
      { code: { percent: 20 }, lines: [{ sku: "mug", price: 1000, quantity: 3, discount: 600 }] },
      { code: { percent: 10 }, lines: [] },
      { code: { amount: 500 }, lines: [{ sku: "gift-wrap", price: 0, quantity: 1, discount: 0 }] },
    ],
    expected: [-5000, -4500, -4000, -2400, 0, 0],
    hidden: [3, 4, 5],
    comments: [
      jo("40 tickets about this since Monday. Every one of them used a promo code."),
    ],
    hints: [
      {
        text: "Where does a returned line's discount come from? Have a look at what `lineTotal` already does with it.",
        when: { behaviour: "active-minutes-without-progress", atLeast: 12 },
      },
      {
        text: "Try the jacket from the ticket on paper: $50.00, $5.00 off at checkout. How many times does the refund take a discount off?",
        when: { behaviour: "failing-pushes", atLeast: 3 },
      },
    ],
    team: [
      {
        id: "ada-abs",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "blocking",
        text: [
          "Taking the absolute value hides the sign we need for refunds. Can we keep refunds negative all the way through?",
          "`Math.abs` here would turn a refund into a charge if the sign is ever wrong upstream. Can we keep refunds negative all the way through instead?",
        ],
        when: { pattern: "Math\\.abs\\(", present: true, file: "src/cart/totals.js" },
        repeat: "while-true",
      },
      {
        id: "ada-order-total",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "blocking",
        text: [
          "This changes `orderTotal` too, and checkout uses that. Can we keep this pull request to refunds?",
        ],
        when: {
          pattern: "return subtotal - discountFor\\(order\\.code, subtotal\\);",
          present: false,
          file: "src/cart/totals.js",
        },
        repeat: "while-true",
      },
      {
        id: "ada-long-refund",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "nit",
        text: ["Nit: `refundTotal` is getting long. Would a helper for one line's amount read better?"],
        when: { metric: "function-lines", above: 12, file: "src/cart/totals.js" },
      },
      {
        id: "sam-incident",
        author: "Sam R",
        role: "SRE",
        where: "review",
        severity: "info",
        text: ["Nice, that's the jacket from the incident. I'll let support know once it's out."],
        when: { check: "case-2", is: "passing" },
      },
    ],
    private: {
      reference: { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
` },
      examples: {
        "ada-abs": {
          fires: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  return -Math.abs(sum(refund.lines.map(lineTotal)));
}
` }],
          quiet: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
` }],
        },
        "ada-order-total": {
          fires: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
import { lineTotal, sum } from "./money.js";

/** What an order charges at checkout, in cents: its lines less the promo code's discount. */
export function orderTotal(order) {
  const subtotal = sum(order.lines.map((line) => line.price * line.quantity));
  return subtotal;
}

/**
 * What a refund gives back for the returned lines, in cents, as a negative amount: refunds
 * stay negative all the way to the ledger.
 */
export function refundTotal(refund) {
  // Each returned line already carries its share of the discount from checkout.
  return -sum(refund.lines.map(lineTotal));
}
` }],
          quiet: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
` }],
        },
        "ada-long-refund": {
          fires: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  let total = 0;
  for (const line of refund.lines) {
    const gross = line.price * line.quantity;
    const share = line.discount ?? 0;
    const paid = gross - share;
    if (paid === 0) {
      continue;
    }
    total += paid;
  }
  if (total === 0) {
    return 0;
  }
  return -total;
}
` }],
          quiet: [{ "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
` }],
        },
      },
    },
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
    parameters: ["issuedAt", "now", "ttlMinutes"],
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
    parameters: ["times", "limit", "windowMs"],
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
  challenge("workspace-slugs", {
    title: "Workspace URLs break on names with accents",
    summary: "Make URL slugs from workspace names, accents and all.",
    kind: "bug",
    difficulty: "easy",
    language: "ruby",
    skills: ["strings", "unicode", "urls"],
    task: '`slugify(name)` turns a workspace name into its URL slug: lowercase ASCII letters and digits, with every run of anything else between words becoming a single hyphen, and no hyphen at either end. Accented Latin letters lose their accents first, so `"Café Ünïcorn"` becomes `"cafe-unicorn"`.',
    inputs: ["Acme Inc", "  Café   Ünïcorn  ", "R&D / Ops", "2024 Planning!!", "---"],
    expected: ["acme-inc", "cafe-unicorn", "r-d-ops", "2024-planning", ""],
    hints: [
      "Unicode normalization (NFD) splits a letter from its accent, so the accent can be dropped.",
    ],
    comments: [
      mateo(
        "Support has a customer whose workspace is \"Équipe Été\". The link we email them is /w/%C3%A9quipe-%C3%A9t%C3%A9 and it 404s.",
      ),
    ],
  }),
  challenge("password-policy", {
    adapter: `import com.acme.accounts.PasswordPolicy;

/** [password] → the rules it breaks. */
final class Adapter {
    static Object call(Json args) {
        return PasswordPolicy.violations(args.at(0).asString());
    }
}
`,
    title: "Password policy still allows 8-character passwords",
    summary: "Enforce the new password rules and report every one that is broken.",
    kind: "bug",
    difficulty: "easy",
    language: "java",
    skills: ["validation", "strings", "security"],
    task: '`PasswordPolicy.violations(password)` lists the rules a password breaks, in this order: `"too-short"` (fewer than 12 characters), `"no-digit"`, `"no-letter"` and `"has-whitespace"`. A password that breaks none gets an empty list.',
    inputs: [
      "correct horse battery",
      "Tr0ub4dor&3",
      "hunter2hunter2",
      "123456789012",
      "",
    ],
    expected: [
      ["no-digit", "has-whitespace"],
      ["too-short"],
      [],
      ["no-letter"],
      ["too-short", "no-digit", "no-letter"],
    ],
    comments: [
      mateo(
        "Security moved the minimum to 12 last quarter. The form says 12, the API still checks 8, and nothing reports the other rules.",
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
  challenge("late-fee-rounding", {
    parameters: ["balance", "daysLate"],
    title: "Late fees are a cent off on some invoices",
    summary: "Round late fees the way finance does: halves away from zero.",
    kind: "bug",
    difficulty: "easy",
    language: "csharp",
    skills: ["rounding", "decimals", "finance"],
    task: "`LateFee(balance, daysLate)` is the fee on an overdue invoice: 0.5% of the balance per day late, capped at 10% of the balance, rounded to cents with halves rounded away from zero. Nothing is charged when the invoice is not late.",
    inputs: [
      [100.0, 1],
      [101.0, 1],
      [1.0, 1],
      [250.0, 30],
      [99.9, 3],
      [80.0, 0],
    ],
    expected: [0.5, 0.51, 0.01, 25, 1.5, 0],
    hints: [
      "Math.Round on a decimal rounds halves to the nearest even digit unless told otherwise.",
    ],
    comments: [
      rui(
        "Customers keep emailing about a one-cent difference between the invoice and the reminder. Finance's spreadsheet rounds 0.505 up.",
      ),
    ],
  }),
  challenge("top-customers", {
    schema: "CREATE TABLE orders (\n  id integer PRIMARY KEY,\n  customer text NOT NULL,\n  total integer NOT NULL\n);",
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
    schema: "CREATE TABLE orders (\n  id integer PRIMARY KEY,\n  customer text NOT NULL\n);\n\nCREATE TABLE payments (\n  order_id integer NOT NULL REFERENCES orders (id),\n  amount integer NOT NULL\n);",
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
    adapter: `#include <stdlib.h>
#include "mm_json.h"

size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out);

/* [capacity, values] → the buffer's contents, oldest first. */
mm_value *mm_call(const mm_value *args) {
    size_t capacity = (size_t)mm_integer(mm_at(args, 0));
    const mm_value *list = mm_at(args, 1);
    size_t count = mm_length(list);
    int *values = calloc(count + 1, sizeof(int));
    int *out = calloc(count + 1, sizeof(int));
    for (size_t i = 0; i < count; i++)
        values[i] = (int)mm_integer(mm_at(list, i));
    size_t kept = ring_buffer(capacity, values, count, out);
    mm_value *result = mm_new_array();
    for (size_t i = 0; i < kept && i <= count; i++)
        mm_push(result, mm_new_integer(out[i]));
    return result;
}
`,
    parameters: ["capacity", "values"],
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
    parameters: ["samples", "p"],
    title: "p99 latency panel times out in busy hours",
    summary: "Compute nearest-rank percentiles for the metrics endpoint.",
    kind: "performance",
    difficulty: "medium",
    language: "go",
    skills: ["sorting", "statistics"],
    task: "`Percentile(samples, p)` returns the nearest-rank percentile: sort the samples and take the value at rank `ceil(p / 100 × n)`, counting from 1. With no samples, `ok` is false (shown as `null` in the checks).",
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
    adapter: `#include <string>
#include <vector>
#include "mm_json.h"

struct Op {
    std::string name;
    int key;
    int value;
};
std::vector<int> simulate(int capacity, const std::vector<Op>& ops);

// [capacity, [[name, key, value?], ...]] → the result of each get.
mm_value *mm_call(const mm_value *args) {
    std::vector<Op> ops;
    const mm_value *list = mm_at(args, 1);
    for (size_t i = 0; i < mm_length(list); i++) {
        const mm_value *op = mm_at(list, i);
        ops.push_back({mm_string(mm_at(op, 0)), (int)mm_integer(mm_at(op, 1)),
                       (int)mm_integer(mm_at(op, 2))});
    }
    mm_value *result = mm_new_array();
    for (int got : simulate((int)mm_integer(mm_at(args, 0)), ops))
        mm_push(result, mm_new_integer(got));
    return result;
}
`,
    parameters: ["capacity", "ops"],
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
    language: "go",
    skills: ["parsing", "config"],
    task: '`ParseDuration(text)` turns strings like `"1h30m"`, `"45s"` or `"2h"` into seconds. Units are `h`, `m` and `s`, each at most once and in that order; anything else returns an error (shown as `null` in the checks).',
    inputs: ["1h30m", "45s", "2h", "1h1h", "90", ""],
    expected: [5400, 45, 7200, null, null, null],
    comments: [
      sam(
        "Somebody set idle_timeout = 3600 meaning minutes. Let people write 1h.",
      ),
    ],
  }),
];

export const SEED_PROJECTS: SeedProject[] = [
  {
    id: "quick-fixes",
    key: "QUICK",
    listed: false,
    title: "Quick fixes",
    summary: "Five-minute bugs: the same small bug in each language, for the five-minute test.",
    story: `Small bugs the writing app's team never got round to. Each takes about five minutes, which makes it the five-minute test at /play: pick a language, fix it, merge it.`,
    issues: ["word-count-python", "word-count-javascript", "word-count-typescript", "word-count-go", "word-count-java", "word-count-csharp", "word-count-ruby", "word-count-php"],
  },
  {
    id: "field-notes",
    key: "FN",
    title: "Field notes",
    summary: "Warm-up: help a field researcher make sense of a messy notebook.",
    story: `A field researcher keeps specimen labels in a notebook and needs exact tallies. A good first ticket: small, in Python, with one surprise in the data.`,
    issues: ["frequency-map"],
  },
  {
    id: "storefront",
    key: "SHOP",
    title: "Shop",
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
    issues: [
      "format-price",
      "discount-codes",
      "filter-form-labels",
      "debounce-search",
      "refund-totals",
    ],
  },
  {
    id: "accounts-api",
    key: "API",
    title: "Accounts API",
    summary: "Backend: sign-up, login and account endpoints behind every app.",
    story: `The service every client talks to for sign-up, login, sessions and password resets. Most of it is Go, a few older endpoints are still PHP, the admin back office is a small Ruby app, the password service is Java, and the login gateway in front is TypeScript.

It mostly works, and the on-call channel has opinions about the rest: list endpoints that accept any page size, reset links that expire too soon, and logs that are hard to search during an incident.

## What you'll work on

- Parsing and validating request parameters with sensible defaults
- Time and expiry logic, where off-by-one and unit mix-ups hide
- Rate limiting and log handling for the people on call

## Good fit if you

- Write backend services, or want practice with the bugs they actually get
- Like **input validation**, edge cases and reading a stack trace at 2am
- Know **Go**, **PHP**, **Ruby**, **Java** or **TypeScript**, or want to try one of them on familiar problems

Stack: Go, PHP, Ruby, Java, TypeScript.`,
    issues: [
      "pagination-params",
      "reset-link-expiry",
      "rate-limiter",
      "parse-log-line",
      "workspace-slugs",
      "password-policy",
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
- Know **Python**, **SQL** or **C#**, or want more practice with them

Stack: Python, SQL, and C# for the billing jobs.`,
    issues: [
      "csv-quoted-fields",
      "dedupe-customers",
      "top-customers",
      "unpaid-orders",
      "late-fee-rounding",
    ],
  },
  {
    id: "edge-proxy",
    key: "EDGE",
    title: "Edge proxy",
    summary: "Systems: the low-latency proxy in front of everything.",
    story: `A small proxy in front of everything: it terminates connections, caches hot responses and exports latency metrics. The hot path is C and C++; the control plane and metrics are Go.

Every allocation shows up on a flame graph here. The backlog is about doing more with fixed memory, measuring the right thing, and keeping configuration readable for whoever is paged.

## What you'll work on

- Fixed-size data structures such as ring buffers and LRU caches
- Latency percentiles and the metrics behind dashboards
- Small, strict configuration formats

## Good fit if you

- Do systems or performance work, or want to get closer to the metal
- Think about memory, ordering and what happens under load
- Know **C**, **C++** or **Go**, or are learning one of them

Stack: C, C++, Go.`,
    issues: ["ring-buffer", "p99-latency", "lru-cache", "parse-duration"],
  },
];
