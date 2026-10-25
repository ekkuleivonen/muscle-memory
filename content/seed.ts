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
  /** Only the person's Resolve clears it (see TeamComment.resolve). */
  resolve?: "explicit";
}

/** A hint: an idea, never solution code. A plain string waits for active minutes. */
export type SeedHint = string | { text: string; when: Trigger };

export interface SeedIssue {
  id: string;
  /**
   * Permanent once published: the language's code and a number, PY-003 (packages/content/keys).
   * A new challenge takes the next free number in its language; none is ever renumbered.
   */
  key: string;
  title: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard";
  kind: "feature" | "bug" | "performance" | "refactor";
  language: string;
  skills: string[];
  task: string;
  inputs: unknown[];
  expected: unknown[];
  /** What each case is about, by index: the repo's tests use them as test names. */
  names?: string[];
  /** Released one at a time, in order, by the lead of the ticket's thread. */
  hints: SeedHint[];
  comments: Comment[];
  /** Later comments released by triggers: on the ticket, or reviewing a pull request. */
  team?: SeedTeamComment[];
  /** CI failures as findings only Resolve clears (see Revision.ciFindings). */
  ciFindings?: "explicit";
  entrypoint: string;
  starter: string;
  /** Named when each input lists several arguments; otherwise it is the only one. */
  parameters?: string[];
  /** SQL: the tables each case's rows go into. */
  schema?: string;
  /** C, C++ and Java: turns a case's JSON arguments into the function's types. */
  adapter?: string;
  /** JavaScript, TypeScript and Python: where the entry file lives, when not the default. */
  entry?: string;
  /**
   * More of the repo: more files to change (edit), source the code uses but may not change
   * (read), and documents (docs). Only multi-file runners (engines.ts) load other source files.
   */
  files?: SeedFile[];
  /** Cases left out of the repo's test file, by index: only CI runs them. */
  hidden?: number[];
  private?: SeedPrivate;
}

export interface SeedFile {
  path: string;
  role: "edit" | "read" | "docs";
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
  /** Other correct designs, as changes to the editable files: each must pass every case. */
  alternatives?: Record<string, string>[];
  /** Plausible wrong fixes: each must fail at least one case. */
  wrong?: Record<string, string>[];
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

import { MORE } from "./more";

const BASE_ISSUES: SeedIssue[] = [
  // Quick fixes: five-minute bugs, one per language, for /play
  challenge("word-count-python", {
    key: "PY-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "python",
    skills: ["strings", "edge-cases"],
    task: `\`count_words(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: { "count_words.py": `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(text.split())
` },
      alternatives: [
        { "count_words.py": `import re


def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(re.findall(r"\\S+", text))
` },
        { "count_words.py": `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len([word for word in text.replace("\\t", " ").replace("\\r", " ").replace("\\n", " ").split(" ") if word])
` },
      ],
      wrong: [
        // Trimming fixes the empty post, not the double space.
        { "count_words.py": `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len(text.strip().split(" ")) if text.strip() else 0
` },
        // Runs of spaces collapse, tabs and newlines still join words.
        { "count_words.py": `def count_words(text):
    """The number of words in a post, as the composer shows it under the text box."""
    return len([word for word in text.split(" ") if word])
` },
      ],
    },
  }),
  challenge("word-count-javascript", {
    key: "JS-002",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "javascript",
    skills: ["strings", "edge-cases"],
    task: `\`countWords(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.split(/\\s+/).filter(Boolean).length;
}
` },
      alternatives: [
        { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return (text.match(/\\S+/g) ?? []).length;
}
` },
        { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\\s+/).length;
}
` },
      ],
      wrong: [
        // Trimming fixes the empty post, not the double space.
        { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.trim() === "" ? 0 : text.trim().split(" ").length;
}
` },
        // Runs of spaces collapse, tabs and newlines still join words.
        { "src/count-words.js": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text) {
  return text.split(/ +/).filter(Boolean).length;
}
` },
      ],
    },
  }),
  challenge("word-count-typescript", {
    key: "TS-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "typescript",
    skills: ["strings", "edge-cases"],
    task: `\`countWords(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: { "src/count-words.ts": `/** The number of words in a post, as the composer shows it under the text box. */
export function countWords(text: string): number {
  return text.split(/\\s+/).filter(Boolean).length;
}
` },
    },
  }),
  challenge("word-count-go", {
    key: "GO-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "go",
    skills: ["strings", "edge-cases"],
    task: `\`CountWords(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
    key: "JAVA-001",
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
    difficulty: "easy",
    language: "java",
    skills: ["strings", "edge-cases"],
    task: `\`WordCount.count(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
    key: "CS-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "csharp",
    skills: ["strings", "edge-cases"],
    task: `\`WordCount.Count(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
    key: "RB-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "ruby",
    skills: ["strings", "edge-cases"],
    task: `\`count_words(text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: { "lib/count_words.rb": `# The number of words in a post, as the composer shows it under the text box.
def count_words(text)
  text.split.length
end
` },
    },
  }),
  challenge("word-count-php", {
    key: "PHP-001",
    title: "The composer says 1 word when the post is empty",
    summary: "A five-minute bug: the word count under the text box is off.",
    kind: "bug",
    difficulty: "easy",
    language: "php",
    skills: ["strings", "edge-cases"],
    task: `\`countWords($text)\` returns the word count the composer shows under a post's text box. Today an empty post says **1 word**, and a double space counts an extra word.

- A word is a run of characters that are not whitespace. Words are separated by any run of whitespace: spaces, tabs, newlines and carriage returns, in any mix and number.
- Whitespace at the start or end adds no words, so an empty or blank post has 0 words.
- Punctuation, digits, symbols and non-English letters are part of the word they are in, and a symbol standing on its own between spaces is a word.`,
    inputs: [
      "",
      "hello world",
      "  spaced   out  ",
      "one",
      "tabs\tand\nnew lines",
      "   ",
      "\t",
      "\n",
      " \t\n \n\t ",
      "  leading",
      "trailing   ",
      "a  b   c    d",
      "line one\nline two\n",
      "first\r\nsecond\r\n",
      "Hello, world! It's done.",
      "café naïve über 日本語 👋",
      "Total: 42 items, 3.5 kg & 100% done - ok",
      "word ".repeat(500),
      "lorem\tipsum\ndolor sit ".repeat(250),
    ],
    expected: [0, 2, 2, 1, 4, 0, 0, 0, 0, 1, 1, 4, 4, 2, 4, 5, 10, 500, 1000],
    hidden: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
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
    key: "PY-002",
    title: "Nightly vial tally is empty",
    summary: "The vial scanner's labels need counting for the nightly sheet; the counter returns nothing.",
    kind: "feature",
    difficulty: "easy",
    language: "python",
    skills: ["iteration", "maps", "edge-cases"],
    task: `Each night the vial scanner reads the label on every vial that came back from the field, and the nightly sheet lists how many vials carry each label. The counting step was never finished, so the sheet comes out empty:

\`\`\`text
nightly sheet 2026-06-04: 212 vials scanned, 0 labels counted
\`\`\`

\`frequency_map(items)\` gets the night's labels as a list of strings, one per vial, and returns a dict that maps each distinct label to the number of vials that carry it.

- Count every label exactly as the scanner read it. Labels are case-sensitive (\`A3\` and \`a3\` are different traps), and spaces, blank labels and odd strings read off smudged labels (such as \`__proto__\`) are labels like any other: they tell the team which vials to relabel by hand.
- No vials gives \`{}\`.
- Don't print anything: the scanner job ships everything on stdout to the warehouse logs.`,
    inputs: [
      ["a", "b", "a"],
      [],
      ["A", "a", "A"],
      ["__proto__", "__proto__", "x"],
      ["x"],
      ["a", "a", "a", "a"],
      ["b", "a", "b", "c", "a", "b"],
      ["Hello", "hello", "HELLO"],
      ["", "", " "],
      ["a ", "a", " a"],
      ["constructor", "toString", "hasOwnProperty", "constructor"],
      ["__proto__"],
      ["1", "1", "2"],
      ["null", "None", "true", "None"],
      ["é", "e", "é"],
    ],
    expected: [
      { a: 2, b: 1 },
      {},
      { A: 2, a: 1 },
      JSON.parse('{"__proto__":2,"x":1}'),
      { x: 1 },
      { a: 4 },
      { b: 3, a: 2, c: 1 },
      { Hello: 1, hello: 1, HELLO: 1 },
      { "": 2, " ": 1 },
      { "a ": 1, a: 1, " a": 1 },
      { constructor: 2, toString: 1, hasOwnProperty: 1 },
      JSON.parse('{"__proto__":1}'),
      { "1": 2, "2": 1 },
      { null: 1, None: 2, true: 1 },
      { "é": 2, e: 1 },
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    team: [
      {
        id: "priya-debug-print",
        author: "Priya K",
        role: "Data",
        where: "review",
        severity: "blocking",
        text: ["Don't print anything: the scanner job ships everything on stdout to the warehouse logs."],
        when: { pattern: "^\\s*print\\(", present: true },
        repeat: "while-true",
      },
    ],
    private: {
      reference: { "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    return counts
` },
      alternatives: [
        { "frequency_map.py": `from collections import Counter


def frequency_map(items):
    return dict(Counter(items))
` },
        { "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        if item in counts:
            counts[item] += 1
        else:
            counts[item] = 1
    return counts
` },
      ],
      wrong: [
        // Folds case: A3 and a3 become one trap.
        { "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        key = item.lower()
        counts[key] = counts.get(key, 0) + 1
    return counts
` },
        // Tidies labels: blanks dropped and spaces trimmed, so the relabelling list loses them.
        { "frequency_map.py": `def frequency_map(items):
    counts = {}
    for item in items:
        key = item.strip()
        if key:
            counts[key] = counts.get(key, 0) + 1
    return counts
` },
        // Counts distinct labels, not vials.
        { "frequency_map.py": `def frequency_map(items):
    return {item: 1 for item in items}
` },
      ],
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
    key: "JS-003",
    title: "Cart shows prices as raw cents",
    summary: "Format amounts as dollars with separators, including refunds.",
    kind: "bug",
    difficulty: "easy",
    language: "javascript",
    skills: ["formatting", "strings", "numbers"],
    task: `Since the cart moved to integer cents, the cart drawer shows amounts the way the API stores them. From a support ticket:

> My cart says the sofa costs **129900**. Is that dollars?? And my refund line says **-500**.

\`formatPrice(cents)\` takes an amount as a whole number of cents and returns the text the drawer, the receipts and the refund lines show.

- Show a dollar sign, then the whole dollars with a comma between every group of three digits, then a dot and exactly two digits of cents: \`123456\` → \`"$1,234.56"\`, \`5\` → \`"$0.05"\`.
- Negative amounts are refunds. The minus goes before the dollar sign, as on the receipts: \`-500\` → \`"-$5.00"\`.
- Amounts can run into the billions of cents.`,
    inputs: [
      123456, 5, 0, -500, 100000000, 1, 10, 99, 100, 1050, 99999, 100000, 123456789,
      12345678901, -1, -99, -123456, -100000000,
    ],
    expected: [
      "$1,234.56",
      "$0.05",
      "$0.00",
      "-$5.00",
      "$1,000,000.00",
      "$0.01",
      "$0.10",
      "$0.99",
      "$1.00",
      "$10.50",
      "$999.99",
      "$1,000.00",
      "$1,234,567.89",
      "$123,456,789.01",
      "-$0.01",
      "-$0.99",
      "-$1,234.56",
      "-$1,000,000.00",
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    private: {
      reference: { "src/format-price.js": `/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  const sign = cents < 0 ? "-" : "";
  const amount = Math.abs(cents);
  const dollars = String(Math.floor(amount / 100)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  const rest = String(amount % 100).padStart(2, "0");
  return \`\${sign}$\${dollars}.\${rest}\`;
}
` },
      alternatives: [
        { "src/format-price.js": `const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  return USD.format(cents / 100);
}
` },
        { "src/format-price.js": `/**
 * Formats an amount in cents for the cart: 123456 → "$1,234.56".
 * Refunds are negative and keep the minus first: -500 → "-$5.00".
 */
export function formatPrice(cents) {
  const amount = Math.abs(cents);
  const dollars = Math.floor(amount / 100).toLocaleString("en-US");
  const rest = String(amount % 100).padStart(2, "0");
  return (cents < 0 ? "-$" : "$") + dollars + "." + rest;
}
` },
      ],
      wrong: [
        // Dollars and cents, but no thousands separators.
        { "src/format-price.js": `export function formatPrice(cents) {
  return (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toFixed(2);
}
` },
        // The minus lands after the dollar sign.
        { "src/format-price.js": `export function formatPrice(cents) {
  const dollars = (cents / 100).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  return "$" + dollars;
}
` },
      ],
    },
  }),
  challenge("discount-codes", {
    key: "TS-002",
    parameters: ["totalCents", "code", "codes"],
    title: "Discount codes fail when typed in lowercase",
    summary: "Match promo codes case-insensitively and ignore stray spaces.",
    kind: "bug",
    difficulty: "easy",
    language: "typescript",
    skills: ["strings", "validation"],
    task: `Customers type promo codes the way they read them in the email, and checkout rejects codes typed in lowercase or with stray spaces.

\`applyDiscount(totalCents, code, codes)\` returns an order's total after its promo code's discount.

- \`totalCents\` is the total in whole cents. \`code\` is what the customer typed. \`codes\` maps each configured code to its percent off, from 0 to 100: \`{ SAVE10: 10 }\`.
- The typed code matches a configured code when the two are equal ignoring letter case and ignoring spaces before and after the typed code. Spaces inside a code still count, and configured codes may be written in any case. Only codes in \`codes\` match.
- With a match, return the total less that percentage, rounded down to whole cents.
- Without a match, including an empty or blank code, return the total unchanged.`,
    inputs: [
      [10000, "save10", { SAVE10: 10 }],
      [10000, " SAVE10 ", { SAVE10: 10 }],
      [999, "HALF", { HALF: 50 }],
      [5000, "NOPE", { SAVE10: 10 }],
      [10000, "Save10", { SAVE10: 10 }],
      [10000, "   save10   ", { SAVE10: 10 }],
      [10000, "SAVE 10", { SAVE10: 10 }],
      [10000, "SAVE1", { SAVE10: 10 }],
      [10000, "", { SAVE10: 10 }],
      [10000, "   ", { SAVE10: 10 }],
      [10000, "save20", { SAVE10: 10, SAVE20: 20 }],
      [10000, "SPRING25", { Spring25: 25 }],
      [10000, "constructor", { SAVE10: 10 }],
      [0, "SAVE10", { SAVE10: 10 }],
      [1, "half", { HALF: 50 }],
      [3333, "save10", { SAVE10: 10 }],
      [12345, " save15", { SAVE15: 15 }],
      [10000, "free", { FREE: 100 }],
      [10000, "zero", { ZERO: 0 }],
    ],
    expected: [
      9000, 9000, 499, 5000, 9000, 9000, 10000, 10000, 10000, 10000, 8000, 7500, 10000, 0, 0,
      2999, 10493, 0, 10000,
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: { "src/apply-discount.ts": `/** Percent off per promo code, as configured in the admin: { SAVE10: 10 }. */
export type Codes = Record<string, number>;

/** The total after the matching code's discount, rounded down to whole cents. */
export function applyDiscount(totalCents: number, code: string, codes: Codes): number {
  const typed = code.trim().toUpperCase();
  const match = Object.keys(codes).find((name) => name.toUpperCase() === typed);
  if (match === undefined) return totalCents;
  return Math.floor(totalCents * (100 - codes[match]) / 100);
}
` },
    },
  }),
  challenge("filter-form-labels", {
    key: "HTML-001",
    parameters: ["selector", "read"],
    title: "Product filter checkboxes have no labels",
    summary: "Tie every filter checkbox to a label so it is accessible.",
    kind: "refactor",
    difficulty: "easy",
    language: "html",
    skills: ["accessibility", "forms", "semantics"],
    task: `The category page's filter form has two checkboxes, \`in-stock\` and \`on-sale\`, with bare text next to them. The accessibility audit flagged them: screen readers announce "checkbox" and nothing else, and clicking the text does not toggle the box.

Tie each checkbox to a label:

- Give each checkbox the id \`filter-NAME\`, where NAME is its \`name\`: \`filter-in-stock\` and \`filter-on-sale\`.
- Give each checkbox a \`<label for="filter-NAME">\` whose text is exactly its name.
- Keep both checkboxes, in the same order, with their \`type\` and \`name\` attributes, and keep everything inside the one \`<form>\`. The page has no other checkboxes or labels.

Each check runs a CSS selector against the page and reads something from the matching elements, in document order: their \`count\`, their \`text\`, their accessible \`label\`, or an attribute such as \`name\` or \`id\`.`,
    inputs: [
      ["form input[type=checkbox]", "name"],
      ["form input[type=checkbox]", "id"],
      ["form input[type=checkbox]", "label"],
      ["form label", "text"],
      ["form", "count"],
      ["input[type=checkbox]", "count"],
      ["label", "count"],
      ["form input[type=checkbox]", "type"],
      ["form label", "for"],
      ["#filter-in-stock", "name"],
      ["#filter-on-sale", "name"],
      ["#filter-in-stock", "label"],
      ["#filter-on-sale", "label"],
      ["label[for=filter-in-stock]", "text"],
      ["label[for=filter-on-sale]", "text"],
      ["form #filter-in-stock, form #filter-on-sale", "count"],
    ],
    expected: [
      ["in-stock", "on-sale"],
      ["filter-in-stock", "filter-on-sale"],
      ["in-stock", "on-sale"],
      ["in-stock", "on-sale"],
      1,
      2,
      2,
      ["checkbox", "checkbox"],
      ["filter-in-stock", "filter-on-sale"],
      ["in-stock"],
      ["on-sale"],
      ["in-stock"],
      ["on-sale"],
      ["in-stock"],
      ["on-sale"],
      2,
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    private: {
      reference: { "templates/filter-form-labels.html": `<!--
  Product filters on the category page. The accessibility audit flagged these
  checkboxes: each needs a label tied to it.
-->
<form>
  <input type="checkbox" name="in-stock" id="filter-in-stock">
  <label for="filter-in-stock">in-stock</label>
  <input type="checkbox" name="on-sale" id="filter-on-sale">
  <label for="filter-on-sale">on-sale</label>
</form>
` },
    },
  }),
  challenge("debounce-search", {
    key: "TS-003",
    parameters: ["keystrokes", "waitMs"],
    title: "Search box sends a request on every keystroke",
    summary:
      "Debounce search-as-you-type so the API sees one request per pause.",
    kind: "performance",
    difficulty: "medium",
    language: "typescript",
    skills: ["timing", "events"],
    task: `The search box sends a request on every keystroke, about eight per query. It should send one request per pause in typing.

\`debounceTimes(keystrokes, waitMs)\` gets the keystroke times in milliseconds, in order (several can share a time), and the wait in milliseconds (0 or more). Return the times at which a search request fires, in order.

- Each keystroke schedules a request \`waitMs\` after it.
- A keystroke at or before the time the scheduled request would fire cancels it, and schedules its own.
- No keystrokes, no requests.`,
    inputs: [
      [[0, 100, 200, 1000], 300],
      [[], 300],
      [[0, 500], 300],
      [[0], 300],
      [[1000], 300],
      [[0, 299], 300],
      [[0, 301], 300],
      [[0, 50, 100, 150, 200], 100],
      [[0, 1000, 2000], 300],
      [[0, 100, 200, 1000, 1100, 1200], 300],
      [[100, 200, 250, 900, 1250], 300],
      [[0, 299, 598, 1000], 300],
      [[0, 0, 0], 300],
      [[0, 10, 20], 1000],
      [[0, 500], 0],
      [[1700000000000, 1700000000100], 300],
      [[0, 5000], 10000],
    ],
    expected: [
      [500, 1300],
      [],
      [300, 800],
      [300],
      [1300],
      [599],
      [300, 601],
      [300],
      [300, 1300, 2300],
      [500, 1500],
      [550, 1200, 1550],
      [898, 1300],
      [300],
      [1020],
      [0, 500],
      [1700000000400],
      [15000],
    ],
    hidden: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    private: {
      reference: { "src/debounce-times.ts": `/**
 * When the search request fires for the given keystroke times (ms): waitMs after
 * a keystroke, unless another keystroke comes first.
 */
export function debounceTimes(keystrokes: number[], waitMs: number): number[] {
  return keystrokes
    .filter((time, i) => i === keystrokes.length - 1 || keystrokes[i + 1] - time > waitMs)
    .map((time) => time + waitMs);
}
` },
    },
  }),

  challenge("refund-totals", {
    key: "JS-005",
    title: "Refunds give back less than the customer paid",
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

\`refundTotal(refund)\` works out what a refund gives back. A refund must give back exactly what the customer paid for the lines returned.

**Input.** All amounts are whole cents, never floats. \`refund\` is \`{ code, lines }\`:

- \`code\` is the order's promo code: \`null\`, a percentage such as \`{ percent: 10 }\`, or a fixed amount in cents such as \`{ amount: 500 }\`.
- \`lines\` are the returned order lines, each \`{ sku, price, quantity, discount }\`. \`price\` is the unit price. \`discount\` is the part of the order's discount that checkout took off this line: at checkout the code's discount is spread over all the order's lines in proportion to their value and stored on each line.

**Output.** What the customer paid for the returned lines, as a negative number of cents: refunds stay negative all the way to the ledger. When they paid nothing for them, it is \`0\`.

**What the file imports.** These helpers can't be changed:

- \`lineTotal(line)\` from \`./money.js\`: what a line charged, \`price × quantity − discount\` (a missing \`discount\` counts as 0).
- \`sum(amounts)\` from \`./money.js\`: the sum of a list of amounts, \`0\` for an empty list.
- \`discountFor(code, subtotal)\` from \`./discounts.js\`: a code's discount on a subtotal: \`0\` without a code, \`Math.round(subtotal × percent / 100)\` for a percentage, \`amount\` for a fixed amount, and never more than \`subtotal\`.

**Leave \`orderTotal\` as it is.** Checkout uses it, and it must keep taking the code's discount (\`discountFor(order.code, …)\`) off the order's subtotal. Keep the change to refunds.`,
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
      { code: { percent: 10 }, lines: [{ sku: "tee", price: 2500, quantity: 2, discount: 500 }] },
      { code: { amount: 1000 }, lines: [{ sku: "boots", price: 3000, quantity: 1, discount: 600 }] },
      { code: { percent: 15 }, lines: [{ sku: "pin-a", price: 333, quantity: 1, discount: 50 }] },
      { code: { amount: 100 }, lines: [{ sku: "card-c", price: 1000, quantity: 1, discount: 34 }] },
      { code: { amount: 5000 }, lines: [{ sku: "belt", price: 3000, quantity: 1, discount: 3000 }] },
      { code: { percent: 5 }, lines: [{ sku: "socks", price: 799, quantity: 12, discount: 479 }] },
      {
        code: { percent: 25 },
        lines: [
          { sku: "hoodie", price: 4000, quantity: 1, discount: 1000 },
          { sku: "beanie", price: 1200, quantity: 2, discount: 600 },
        ],
      },
      { code: { percent: 10 }, lines: [{ sku: "rain-jacket", price: 5000, quantity: 2, discount: 1000 }] },
      {
        code: null,
        lines: [
          { sku: "poster", price: 1999, quantity: 1, discount: 0 },
          { sku: "sticker", price: 1, quantity: 3, discount: 0 },
        ],
      },
      {
        code: { percent: 33 },
        lines: [
          { sku: "lamp", price: 4999, quantity: 1, discount: 1649 },
          { sku: "shade", price: 1250, quantity: 1, discount: 414 },
        ],
      },
      { code: { percent: 33 }, lines: [{ sku: "bulb", price: 350, quantity: 4, discount: 461 }] },
    ],
    expected: [-5000, -4500, -4000, -2400, 0, 0, -4500, -2400, -283, -966, 0, -9109, -4800, -9000, -2002, -4186, -939],
    hidden: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    team: [
      {
        id: "ada-order-total",
        author: "Ada N",
        role: "Frontend",
        where: "review",
        severity: "blocking",
        text: [
          "Leave `orderTotal` as it is: checkout uses it, and it must keep taking the code's discount off the order's subtotal. Keep the change to refunds.",
        ],
        // Checkout's total still takes the code's discount off its subtotal, however it is written.
        when: {
          pattern: "discountFor\\(\\s*order\\.code",
          present: false,
          file: "src/cart/totals.js",
        },
        repeat: "while-true",
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
      alternatives: [
        // Spelled out per line, without the helper.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  let paid = 0;
  for (const line of refund.lines) paid += line.price * line.quantity - (line.discount ?? 0);
  return -paid;
}
` },
        // Taking the absolute value is fine too: refunds come out negative either way.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  return -Math.abs(sum(refund.lines.map(lineTotal)));
}
` },
        // A tidier orderTotal, same behaviour: checkout is not touched.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
import { lineTotal, sum } from "./money.js";

/** What an order charges at checkout, in cents: its lines less the promo code's discount. */
export function orderTotal(order) {
  const subtotal = sum(order.lines.map((line) => line.price * line.quantity));
  const discount = discountFor(order.code, subtotal);
  return subtotal - discount;
}

/** What a refund gives back for the returned lines, in cents, as a negative amount. */
export function refundTotal(refund) {
  return -sum(refund.lines.map(lineTotal));
}
` },
      ],
      wrong: [
        // Works out the code's discount again on just the returned lines: right for the
        // ticket's jacket, wrong for a fixed-amount code on part of an order.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  const gross = sum(refund.lines.map((line) => line.price * line.quantity));
  return -(gross - discountFor(refund.code, gross));
}
` },
        // Gives back the full price, ignoring the discount altogether.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  return -sum(refund.lines.map((line) => line.price * line.quantity));
}
` },
        // The right amount with the wrong sign.
        { "src/cart/totals.js": `import { discountFor } from "./discounts.js";
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
  return sum(refund.lines.map(lineTotal));
}
` },
      ],
      examples: {
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
      },
    },
  }),
  // Accounts API: backend
  challenge("pagination-params", {
    key: "GO-002",
    title: "List endpoints accept any page size",
    summary: "Parse page and per_page with defaults and a hard cap.",
    kind: "bug",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "validation", "http"],
    task: `The list endpoints accept any page size, and the mobile app sends \`per_page=500\` to fetch everything in one go. Cap it, don't reject it.

\`ParsePage(query)\` reads \`page\` and \`per_page\` from a URL query string without the leading \`?\`, such as \`page=2&per_page=50\`, and returns them as a \`Page\`.

- \`page\` defaults to 1 and \`per_page\` to 20.
- Each falls back to its default on its own when it is missing, empty, zero, negative or not a whole number.
- A \`per_page\` above 100 becomes 100. \`page\` has no upper limit.
- Parameter names are matched exactly, other parameters are ignored, and the order of parameters doesn't matter.`,
    inputs: [
      "page=2&per_page=50",
      "",
      "per_page=500",
      "page=-1&per_page=abc",
      "page=3",
      "per_page=100",
      "per_page=101",
      "page=0&per_page=0",
      "per_page=-5",
      "per_page=-500",
      "page=abc",
      "per_page=1",
      "per_page=50&page=4",
      "page=7&per_page=20&sort=name",
      "page=&per_page=",
      "page=5&per_page=abc",
      "page=1000000",
      "perPage=50",
    ],
    expected: [
      { page: 2, perPage: 50 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 100 },
      { page: 1, perPage: 20 },
      { page: 3, perPage: 20 },
      { page: 1, perPage: 100 },
      { page: 1, perPage: 100 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 20 },
      { page: 1, perPage: 1 },
      { page: 4, perPage: 50 },
      { page: 7, perPage: 20 },
      { page: 1, perPage: 20 },
      { page: 5, perPage: 20 },
      { page: 1000000, perPage: 20 },
      { page: 1, perPage: 20 },
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    private: {
      reference: {
        "parse_page.go": `package accounts

import (
	"net/url"
	"strconv"
)

// Page is the pagination requested by a list endpoint.
type Page struct {
	Page    int \`json:"page"\`
	PerPage int \`json:"perPage"\`
}

// ParsePage reads page and per_page from a URL query string, with defaults
// of page 1 and 20 per page, and per_page capped at 100.
func ParsePage(query string) Page {
	values, _ := url.ParseQuery(query)
	perPage := positiveOr(values.Get("per_page"), 20)
	if perPage > 100 {
		perPage = 100
	}
	return Page{Page: positiveOr(values.Get("page"), 1), PerPage: perPage}
}

// positiveOr reads a positive whole number, or gives the fallback for anything else.
func positiveOr(text string, fallback int) int {
	n, err := strconv.Atoi(text)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}
`,
      },
    },
  }),
  challenge("reset-link-expiry", {
    key: "PHP-002",
    parameters: ["issuedAt", "now", "ttlMinutes"],
    title: "Password reset links expire after a minute",
    summary: "The TTL is in minutes but the check compares seconds.",
    kind: "bug",
    difficulty: "easy",
    language: "php",
    skills: ["time", "units"],
    task: `Customers say password reset emails never work. They do, if you click within a minute: links expire far too early.

\`isExpired($issuedAt, $now, $ttlMinutes)\` returns whether a password reset link has expired. \`$issuedAt\` and \`$now\` are Unix timestamps in seconds, and \`$ttlMinutes\` is how long the link lasts, in minutes (0 or more).

- A link stays valid up to and including \`$issuedAt + $ttlMinutes × 60\`. It is expired only at a later time.`,
    inputs: [
      [1000, 1059, 60],
      [1000, 4600, 60],
      [1000, 4601, 60],
      [1000, 1000, 0],
      [1000, 1060, 1],
      [1000, 1061, 1],
      [1000, 1001, 0],
      [0, 60, 1],
      [0, 61, 1],
      [1000, 1600, 10],
      [1000, 1601, 10],
      [1700000000, 1700000900, 15],
      [1700000000, 1700000901, 15],
      [1700000000, 1700086400, 1440],
      [1700000000, 1700086401, 1440],
      [1700000000, 1699999990, 15],
    ],
    expected: [
      false, false, true, false, false, true, true, false, true, false, true, false, true,
      false, true, false,
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    private: {
      reference: {
        "src/isExpired.php": `<?php

declare(strict_types=1);

/**
 * Whether a password reset link has expired. Timestamps are Unix seconds;
 * a link stays valid until $issuedAt + $ttlMinutes * 60, inclusive.
 */
function isExpired(int $issuedAt, int $now, int $ttlMinutes): bool
{
    return $now > $issuedAt + $ttlMinutes * 60;
}
`,
      },
    },
  }),
  challenge("rate-limiter", {
    key: "TS-004",
    parameters: ["times", "limit", "windowMs"],
    title: "Rate-limit login attempts",
    summary: "Allow at most n attempts in any sliding window.",
    kind: "feature",
    difficulty: "medium",
    language: "typescript",
    skills: ["sliding-window", "queues"],
    task: `A credential-stuffing bot hit the login endpoint again last night. Limit login attempts with a sliding window.

\`allow(times, limit, windowMs)\` gets the times of login attempts in milliseconds, in order (several can share a time), and returns, for each attempt, whether it is allowed.

- An attempt at time \`t\` is allowed when fewer than \`limit\` allowed attempts fall in the window from just after \`t − windowMs\` up to and including \`t\`. Otherwise it is rejected.
- Rejected attempts don't count toward the limit.
- \`limit\` can be 0, which rejects every attempt.`,
    inputs: [
      [[0, 1, 2, 3], 3, 10],
      [[], 1, 10],
      [[0, 10, 20], 1, 10],
      [[0, 0, 0, 0], 2, 10],
      [[0, 5, 10, 15], 2, 10],
      [[1, 2, 3], 0, 10],
      [[0, 1, 2, 10], 3, 10],
      [[0, 1, 2, 9], 3, 10],
      [[0, 1, 2, 9, 12], 3, 10],
      [[0, 100, 200, 300], 3, 1000],
      [[0, 1, 2], 1, 1],
      [[1700000000000, 1700000000500, 1700000001000, 1700000001500, 1700000060600], 3, 60000],
      [[5, 6, 7, 12], 3, 10],
      [[995, 1000, 1005], 2, 1000],
      [[0, 10, 20, 30, 40], 2, 20],
      [[1000, 1000, 1000], 1, 1000],
      [[0, 1000, 1999, 2000], 2, 1000],
    ],
    expected: [
      [true, true, true, false],
      [],
      [true, true, true],
      [true, true, false, false],
      [true, true, true, true],
      [false, false, false],
      [true, true, true, true],
      [true, true, true, false],
      [true, true, true, false, true],
      [true, true, true, false],
      [true, true, true],
      [true, true, true, false, true],
      [true, true, true, false],
      [true, true, false],
      [true, true, true, true, true],
      [true, false, false],
      [true, true, true, true],
    ],
    hidden: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    private: {
      reference: {
        "src/allow.ts": `/**
 * For each login attempt time, whether it is allowed: at most \`limit\` attempts
 * may fall inside any window of \`windowMs\` milliseconds.
 */
export function allow(times: number[], limit: number, windowMs: number): boolean[] {
  const recent: number[] = [];
  return times.map((time) => {
    while (recent.length > 0 && recent[0] <= time - windowMs) recent.shift();
    if (recent.length >= limit) return false;
    recent.push(time);
    return true;
  });
}
`,
      },
    },
  }),
  challenge("workspace-slugs", {
    key: "RB-002",
    title: "Workspace URLs break on names with accents",
    summary: "Make URL slugs from workspace names, accents and all.",
    kind: "bug",
    difficulty: "easy",
    language: "ruby",
    skills: ["strings", "unicode", "urls"],
    task: `Workspace URLs are \`/w/<slug>\`. For names with accents, the link we email is percent-encoded and 404s.

\`slugify(name)\` turns a workspace name into its slug:

- The slug has only lowercase ASCII letters \`a\`–\`z\`, digits \`0\`–\`9\` and hyphens. Uppercase letters become lowercase.
- Accented Latin letters lose their accents and keep their base letter, whether the accent is part of the character or a separate combining mark after it: \`"Café Ünïcorn"\` → \`"cafe-unicorn"\`.
- Every run of anything else (spaces, punctuation, underscores, hyphens, symbols, emoji, other scripts) between kept characters becomes a single hyphen. There is no hyphen at either end.
- A name with nothing to keep gives \`""\`.`,
    inputs: [
      "Acme Inc",
      "  Café   Ünïcorn  ",
      "R&D / Ops",
      "2024 Planning!!",
      "---",
      "Équipe Été",
      "ACME",
      "already-a-slug",
      "Team_42",
      "a--b",
      "Señor Piñata",
      "Crème Brûlée Co.",
      "naïve façade",
      "ÀÉÎÕÜ",
      "Ångström Labs",
      "Cafe\u0301 Nuit",
      "日本 Team",
      "🚀 Launch 🚀",
      "Q3/Q4 Roadmap",
      "Tab\tSeparated\nName",
      "",
    ],
    expected: [
      "acme-inc",
      "cafe-unicorn",
      "r-d-ops",
      "2024-planning",
      "",
      "equipe-ete",
      "acme",
      "already-a-slug",
      "team-42",
      "a-b",
      "senor-pinata",
      "creme-brulee-co",
      "naive-facade",
      "aeiou",
      "angstrom-labs",
      "cafe-nuit",
      "team",
      "launch",
      "q3-q4-roadmap",
      "tab-separated-name",
      "",
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    private: {
      reference: {
        "lib/slugify.rb": `# Workspace URLs are /w/<slug>. Turn a workspace name into its slug:
# lowercase ASCII letters and digits, words joined by single hyphens.
def slugify(name)
  name.unicode_normalize(:nfd)
      .gsub(/\\p{Mn}/, "")
      .downcase
      .gsub(/[^a-z0-9]+/, "-")
      .gsub(/\\A-+|-+\\z/, "")
end
`,
      },
    },
  }),
  challenge("password-policy", {
    key: "JAVA-002",
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
    task: `Security raised the minimum password length to 12, and the sign-up form says 12, but the API still checks 8 and reports no other rule.

\`PasswordPolicy.violations(password)\` returns every rule the password breaks, in this order:

1. \`"too-short"\`: fewer than 12 characters. Every character counts, whitespace included.
2. \`"no-digit"\`: no digit.
3. \`"no-letter"\`: no letter, in either case.
4. \`"has-whitespace"\`: a space, tab or other whitespace character anywhere.

A password that breaks none of them gets an empty list.`,
    inputs: [
      "correct horse battery",
      "Tr0ub4dor&3",
      "hunter2hunter2",
      "123456789012",
      "",
      "abcdefghijk1",
      "abcdefghij1",
      "abcdefghijkl",
      "passwordpassword",
      "abcdef 12345",
      "abc\tdefgh1234",
      "zzzzzzzzzzz9 ",
      "!!!!!!!!!!!!",
      "            ",
      "a1",
      "a b",
      "1 2",
      " ",
      "ALLCAPSLETTERS9",
    ],
    expected: [
      ["no-digit", "has-whitespace"],
      ["too-short"],
      [],
      ["no-letter"],
      ["too-short", "no-digit", "no-letter"],
      [],
      ["too-short"],
      ["no-digit"],
      ["no-digit"],
      ["has-whitespace"],
      ["has-whitespace"],
      ["has-whitespace"],
      ["no-digit", "no-letter"],
      ["no-digit", "no-letter", "has-whitespace"],
      ["too-short"],
      ["too-short", "no-digit", "has-whitespace"],
      ["too-short", "no-letter", "has-whitespace"],
      ["too-short", "no-digit", "no-letter", "has-whitespace"],
      [],
    ],
    hidden: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: {
        "src/main/java/com/acme/accounts/PasswordPolicy.java": `package com.acme.accounts;

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
        boolean digit = false;
        boolean letter = false;
        boolean whitespace = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            digit |= Character.isDigit(c);
            letter |= Character.isLetter(c);
            whitespace |= Character.isWhitespace(c);
        }
        List<String> broken = new ArrayList<>();
        if (password.length() < 12) broken.add("too-short");
        if (!digit) broken.add("no-digit");
        if (!letter) broken.add("no-letter");
        if (whitespace) broken.add("has-whitespace");
        return broken;
    }
}
`,
      },
    },
  }),
  challenge("parse-log-line", {
    key: "GO-003",
    title: "Access log parser drops fields on 5xx lines",
    summary: "Turn an access log line into a structured record.",
    kind: "bug",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "strings"],
    task: `Alerting is blind to the 502s: the access log parser comes back with empty fields.

\`ParseLine(line)\` parses one access log line, such as \`GET /cart 200 12ms\`, into an \`Entry\`. A line has four fields separated by single spaces:

- \`Method\`: the HTTP method, as written.
- \`Path\`: the request path as written, including any query string. It never contains a space.
- \`Status\`: the status code, as an integer.
- \`Ms\`: the duration, as an integer. Durations are always whole milliseconds followed by \`ms\`: \`1300ms\` is \`1300\`.`,
    inputs: [
      "GET /cart 200 12ms",
      "POST /pay 502 1300ms",
      "DELETE /sessions/42 204 3ms",
      "GET /search?q=red+shoes&page=2 200 87ms",
      "PUT /users/7/avatar 413 0ms",
      "GET / 301 1ms",
      "PATCH /orders/1009 409 15ms",
      "HEAD /health 200 0ms",
      "GET /reports/2024/q4 504 30000ms",
      "POST /login 401 245ms",
      "GET /static/app.js 304 2ms",
      "OPTIONS /api/v1/items 200 5ms",
      "GET /metrics/p99-200ms 503 1200ms",
      "POST /pay 500 1ms",
      "GET /checkout 503 60000ms",
    ],
    expected: [
      { method: "GET", path: "/cart", status: 200, ms: 12 },
      { method: "POST", path: "/pay", status: 502, ms: 1300 },
      { method: "DELETE", path: "/sessions/42", status: 204, ms: 3 },
      { method: "GET", path: "/search?q=red+shoes&page=2", status: 200, ms: 87 },
      { method: "PUT", path: "/users/7/avatar", status: 413, ms: 0 },
      { method: "GET", path: "/", status: 301, ms: 1 },
      { method: "PATCH", path: "/orders/1009", status: 409, ms: 15 },
      { method: "HEAD", path: "/health", status: 200, ms: 0 },
      { method: "GET", path: "/reports/2024/q4", status: 504, ms: 30000 },
      { method: "POST", path: "/login", status: 401, ms: 245 },
      { method: "GET", path: "/static/app.js", status: 304, ms: 2 },
      { method: "OPTIONS", path: "/api/v1/items", status: 200, ms: 5 },
      { method: "GET", path: "/metrics/p99-200ms", status: 503, ms: 1200 },
      { method: "POST", path: "/pay", status: 500, ms: 1 },
      { method: "GET", path: "/checkout", status: 503, ms: 60000 },
    ],
    hidden: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    private: {
      reference: {
        "parse_line.go": `package accesslog

import (
	"strconv"
	"strings"
)

// Entry is one line of the access log.
type Entry struct {
	Method string \`json:"method"\`
	Path   string \`json:"path"\`
	Status int    \`json:"status"\`
	Ms     int    \`json:"ms"\`
}

// ParseLine parses lines like "GET /cart 200 12ms".
func ParseLine(line string) Entry {
	fields := strings.Fields(line)
	if len(fields) != 4 {
		return Entry{}
	}
	status, _ := strconv.Atoi(fields[2])
	ms, _ := strconv.Atoi(strings.TrimSuffix(fields[3], "ms"))
	return Entry{Method: fields[0], Path: fields[1], Status: status, Ms: ms}
}
`,
      },
    },
  }),

  // Data platform: imports, cleaning and reports
  challenge("csv-quoted-fields", {
    key: "PY-004",
    title: "CSV import splits company names on commas",
    summary: "Respect quoted fields when parsing partner exports.",
    kind: "bug",
    difficulty: "easy",
    language: "python",
    skills: ["parsing", "strings", "csv"],
    task: `Since Northwind started quoting company names, their nightly customer import loads rows into the wrong columns. From last night's load:

\`\`\`text
line   "Acme, Inc.",42,"NY"
loaded name='"Acme'  account=' Inc."'  region='42'
\`\`\`

\`parse_csv_line(line)\` splits one line of a partner export into its fields and returns them as a list of strings.

- Fields are separated by commas, except for commas inside double quotes.
- The quotes around a quoted field are not part of the field, and a doubled quote inside a quoted field is one literal quote: \`"say ""hi"""\` → \`say "hi"\`.
- A quoted field may contain a line break.
- Spaces are kept as written. Empty fields are kept, including at the start or end of the line.
- An empty line is a single empty field, which the import reports as a row with no name.`,
    inputs: [
      "a,b,c",
      '"Acme, Inc.",42,"NY"',
      '"say ""hi""",x',
      "",
      "a",
      "a,,b",
      ",",
      "a,",
      ",a",
      '""',
      '"",""',
      '"a,b,c"',
      '""""',
      '"x"",""y"',
      " a , b ",
      '"Acme, Inc.","Smith, John",""',
      '"line1\nline2",x',
      '"Café, Ltd",€5',
    ],
    expected: [
      ["a", "b", "c"],
      ["Acme, Inc.", "42", "NY"],
      ['say "hi"', "x"],
      [""],
      ["a"],
      ["a", "", "b"],
      ["", ""],
      ["a", ""],
      ["", "a"],
      [""],
      ["", ""],
      ["a,b,c"],
      ['"'],
      ['x","y'],
      [" a ", " b "],
      ["Acme, Inc.", "Smith, John", ""],
      ["line1\nline2", "x"],
      ["Café, Ltd", "€5"],
    ],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    private: {
      reference: { "parse_csv_line.py": `def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    fields, field, quoted, i = [], [], False, 0
    while i < len(line):
        char = line[i]
        if quoted and char == '"' and line[i + 1 : i + 2] == '"':
            field.append('"')
            i += 1
        elif char == '"':
            quoted = not quoted
        elif char == "," and not quoted:
            fields.append("".join(field))
            field = []
        else:
            field.append(char)
        i += 1
    fields.append("".join(field))
    return fields
` },
      alternatives: [
        // The standard library's reader, with the blank line handled.
        { "parse_csv_line.py": `import csv
import io


def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    return next(csv.reader(io.StringIO(line, newline="")), [""])
` },
        // A different hand-written parser: one field at a time.
        { "parse_csv_line.py": `def parse_csv_line(line):
    """Split a partner CSV line on commas, except inside double quotes.

    Quotes are removed, and a doubled quote inside a quoted field is a literal quote.
    """
    fields = []
    i = 0
    while True:
        if line[i : i + 1] == '"':
            end = i + 1
            value = ""
            while True:
                close = line.index('"', end)
                value += line[end:close]
                if line[close + 1 : close + 2] == '"':
                    value += '"'
                    end = close + 2
                else:
                    i = close + 1
                    break
            fields.append(value)
        else:
            comma = line.find(",", i)
            stop = len(line) if comma == -1 else comma
            fields.append(line[i:stop])
            i = stop
        if i >= len(line):
            return fields
        i += 1
        if i == len(line):
            fields.append("")
            return fields
` },
      ],
      wrong: [
        // Drops every quote, then splits: Acme's comma still splits the name.
        { "parse_csv_line.py": `def parse_csv_line(line):
    return line.replace('"', "").split(",")
` },
        // Respects quotes but treats a doubled quote as closing and reopening the field.
        { "parse_csv_line.py": `def parse_csv_line(line):
    fields, field, quoted = [], [], False
    for char in line:
        if char == '"':
            quoted = not quoted
        elif char == "," and not quoted:
            fields.append("".join(field))
            field = []
        else:
            field.append(char)
    fields.append("".join(field))
    return fields
` },
        // Strips spaces the partner wrote.
        { "parse_csv_line.py": `import csv
import io


def parse_csv_line(line):
    row = next(csv.reader(io.StringIO(line, newline=""), skipinitialspace=True), [""])
    return [field.strip() for field in row]
` },
      ],
    },
  }),
  challenge("dedupe-customers", {
    key: "PY-007",
    title: "Deduplicate customer records by email",
    summary: "Keep the first record per email before the newsletter sync.",
    kind: "feature",
    difficulty: "medium",
    language: "python",
    skills: ["maps", "data-cleaning"],
    task: `Some subscribers got last week's newsletter three times. The sync sends one email per customer record, and the CRM export has several records for the same person:

\`\`\`text
id  email
1   Ann@x.io
2    ann@x.io
3   bo@x.io
\`\`\`

\`dedupe(records)\` runs before the newsletter sync. It gets a list of customer records, dicts with at least an \`id\` and an \`email\`, and returns the list without duplicates.

- Two records are duplicates when their emails match ignoring letter case (any letter, not only ASCII) and spaces around them. Only the email decides; ids and other fields don't.
- Keep the first record for each email and drop the later ones. Records stay in their original order.
- A kept record is passed on unchanged, every field included: the sync and the CRM both need the email as it was written.`,
    inputs: [
      [
        { id: 1, email: "Ann@x.io" },
        { id: 2, email: " ann@x.io" },
        { id: 3, email: "bo@x.io" },
      ],
      [],
      [{ id: 1, email: "ann@x.io" }],
      [{ id: 1, email: "ann@x.io" }, { id: 2, email: "bo@x.io" }, { id: 3, email: "cy@x.io" }],
      [{ id: 1, email: "ANN@X.IO" }, { id: 2, email: "ann@x.io" }, { id: 3, email: "Ann@X.io" }],
      [{ id: 1, email: "bo@x.io  " }, { id: 2, email: "  BO@x.io" }, { id: 3, email: "bo@x.io" }],
      [{ id: 1, email: " Ann@x.io " }, { id: 2, email: "ann@x.io" }],
      [{ id: 1, email: "a@x.io" }, { id: 2, email: "b@x.io" }, { id: 3, email: "A@x.io" }, { id: 4, email: "c@x.io" }, { id: 5, email: "B@X.IO" }],
      [{ id: 1, email: "ann@x.io" }, { id: 2, email: "ann@x.com" }, { id: 3, email: "ann@y.io" }],
      [{ id: 7, email: "ann@x.io" }, { id: 7, email: "bo@x.io" }],
      [{ id: 1, email: "ann@x.io", name: "Ann", plan: "pro" }, { id: 2, email: "ANN@x.io", name: "Ann B", plan: "free" }],
      [{ id: 1, email: "bo@x.io" }, { id: 2, email: "cy@x.io" }, { id: 3, email: "dee@x.io" }, { id: 4, email: " DEE@x.io" }],
      [{ id: 1, email: "ÅSA@x.io" }, { id: 2, email: "åsa@x.io" }],
      [{ id: 3, email: "cy@x.io" }, { id: 1, email: "ann@x.io" }, { id: 2, email: "CY@x.io" }],
      [{ id: 1, email: "ann@x.io" }, { id: 2, email: "Ann@x.io" }, { id: 3, email: "bo@x.io" }, { id: 4, email: "ANN@X.IO " }, { id: 5, email: " bo@x.io" }, { id: 6, email: "cy@x.io" }],
    ],
    expected: [
      [
        { id: 1, email: "Ann@x.io" },
        { id: 3, email: "bo@x.io" },
      ],
      [],
      [{ id: 1, email: "ann@x.io" }],
      [{ id: 1, email: "ann@x.io" }, { id: 2, email: "bo@x.io" }, { id: 3, email: "cy@x.io" }],
      [{ id: 1, email: "ANN@X.IO" }],
      [{ id: 1, email: "bo@x.io  " }],
      [{ id: 1, email: " Ann@x.io " }],
      [{ id: 1, email: "a@x.io" }, { id: 2, email: "b@x.io" }, { id: 4, email: "c@x.io" }],
      [{ id: 1, email: "ann@x.io" }, { id: 2, email: "ann@x.com" }, { id: 3, email: "ann@y.io" }],
      [{ id: 7, email: "ann@x.io" }, { id: 7, email: "bo@x.io" }],
      [{ id: 1, email: "ann@x.io", name: "Ann", plan: "pro" }],
      [{ id: 1, email: "bo@x.io" }, { id: 2, email: "cy@x.io" }, { id: 3, email: "dee@x.io" }],
      [{ id: 1, email: "ÅSA@x.io" }],
      [{ id: 3, email: "cy@x.io" }, { id: 1, email: "ann@x.io" }],
      [{ id: 1, email: "ann@x.io" }, { id: 3, email: "bo@x.io" }, { id: 6, email: "cy@x.io" }],
    ],
    hidden: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    private: {
      reference: { "dedupe.py": `def dedupe(records):
    """Keep the first record for each email before the newsletter sync.

    Emails compare case-insensitively, ignoring surrounding spaces. Order is kept.
    """
    seen = set()
    kept = []
    for record in records:
        key = record["email"].strip().lower()
        if key not in seen:
            seen.add(key)
            kept.append(record)
    return kept
` },
      alternatives: [
        // A dict keeps the first record per email, in insertion order.
        { "dedupe.py": `def dedupe(records):
    first = {}
    for record in records:
        first.setdefault(record["email"].strip().casefold(), record)
    return list(first.values())
` },
        { "dedupe.py": `def dedupe(records):
    keys = [record["email"].strip().lower() for record in records]
    return [record for i, record in enumerate(records) if keys[i] not in keys[:i]]
` },
      ],
      wrong: [
        // Matches case-insensitively but not across surrounding spaces.
        { "dedupe.py": `def dedupe(records):
    seen, kept = set(), []
    for record in records:
        key = record["email"].lower()
        if key not in seen:
            seen.add(key)
            kept.append(record)
    return kept
` },
        // Keeps the last record per email instead of the first.
        { "dedupe.py": `def dedupe(records):
    last = {}
    for record in records:
        last[record["email"].strip().lower()] = record
    return list(last.values())
` },
        // Writes the normalised email back into the record.
        { "dedupe.py": `def dedupe(records):
    seen, kept = set(), []
    for record in records:
        email = record["email"].strip().lower()
        if email not in seen:
            seen.add(email)
            kept.append({**record, "email": email})
    return kept
` },
      ],
    },
  }),
  challenge("late-fee-rounding", {
    key: "CS-002",
    parameters: ["balance", "daysLate"],
    title: "Late fees are a cent off on some invoices",
    summary: "Round late fees the way finance does: halves away from zero.",
    kind: "bug",
    difficulty: "easy",
    language: "csharp",
    skills: ["rounding", "decimals", "finance"],
    task: `Customers keep emailing about a one-cent difference between the invoice and the reminder: the late fee doesn't round the way finance's spreadsheet does.

\`LateFee(balance, daysLate)\` returns the late fee on an overdue invoice. \`balance\` is the amount owed in dollars (0 or more, to the cent), and the fee is in dollars too.

- The fee is 0.5% of the balance for each day late, at most 10% of the balance.
- That fee is rounded to cents with halves rounded away from zero, as the spreadsheet does: a fee of 0.505 is 0.51.
- Nothing is charged when \`daysLate\` is 0 or negative.`,
    inputs: [
      [100.0, 1],
      [101.0, 1],
      [1.0, 1],
      [250.0, 30],
      [99.9, 3],
      [80.0, 0],
      [5.0, 1],
      [9.0, 1],
      [21.0, 1],
      [33.3, 1],
      [10.1, 1],
      [100.0, 20],
      [100.0, 21],
      [5.05, 20],
      [5.05, 30],
      [80.0, -3],
      [0.0, 10],
      [1234.5, 7],
      [1000000.0, 365],
      [0.01, 1],
    ],
    expected: [0.5, 0.51, 0.01, 25, 1.5, 0, 0.03, 0.05, 0.11, 0.17, 0.05, 10, 10, 0.51, 0.51, 0, 0, 43.21, 100000, 0],
    hidden: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    private: {
      reference: { "src/LateFees.cs": `namespace Billing;

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
        return Math.Round(Math.Min(fee, balance * 0.10m), 2, MidpointRounding.AwayFromZero);
    }
}
` },
    },
  }),
  challenge("top-customers", {
    key: "SQL-001",
    schema: "CREATE TABLE orders (\n  id integer PRIMARY KEY,\n  customer text NOT NULL,\n  total integer NOT NULL\n);",
    title: "Revenue by customer for the monthly report",
    summary: "Total each customer's orders, biggest first.",
    kind: "feature",
    difficulty: "easy",
    language: "sql",
    skills: ["aggregation", "sorting"],
    task: `The monthly report needs revenue by customer. Write the query.

The database (PostgreSQL) has one table, \`orders\`, with one row per order:

| column | type | meaning |
| --- | --- | --- |
| \`id\` | \`integer\`, primary key | the order's id |
| \`customer\` | \`text\`, not null | the customer's name |
| \`total\` | \`integer\`, not null | the order's total; can be 0, or negative for an adjustment |

Return one row per customer who has orders, with two columns in this order: the customer's name, and the sum of the totals of their orders. Order the rows by that sum, highest first. Column names don't matter. Names match exactly as written, and a sum can be larger than a 32-bit integer holds. No orders gives no rows.`,
    inputs: [
      {
        orders: [
          [1, "ana", 30],
          [2, "bo", 10],
          [3, "ana", 5],
        ],
      },
      { orders: [] },
      { orders: [[1, "ana", 30]] },
      { orders: [[1, "ana", 10], [2, "ana", 20], [3, "ana", 5]] },
      { orders: [[1, "ana", 40], [2, "bo", 15], [3, "bo", 15], [4, "bo", 15]] },
      { orders: [[1, "ana", 5], [2, "bo", 20], [3, "cy", 12], [4, "dee", 30]] },
      { orders: [[1, "cy", 7], [2, "ana", 3], [3, "bo", 9], [4, "cy", 1], [5, "ana", 10], [6, "bo", 1]] },
      { orders: [[1, "ana", 25], [2, "bo", 0]] },
      { orders: [[1, "ana", 50], [2, "bo", 20], [3, "bo", -30]] },
      { orders: [[1, "a", 9], [2, "b", 100], [3, "c", 10]] },
      { orders: [[1, "ana", 100], [2, "bo", 1], [3, "bo", 1], [4, "bo", 1]] },
      { orders: [[1, "o'brien", 12], [2, "Acme, Inc.", 30], [3, "o'brien", 20]] },
      { orders: [[1, "ana", 1500000000], [2, "ana", 1500000000], [3, "bo", 2000000000]] },
      { orders: [[1, "f", 6], [2, "b", 2], [3, "h", 8], [4, "d", 4], [5, "a", 1], [6, "g", 7], [7, "c", 3], [8, "e", 5], [9, "a", 10]] },
    ],
    expected: [
      [
        ["ana", 35],
        ["bo", 10],
      ],
      [],
      [["ana", 30]],
      [["ana", 35]],
      [["bo", 45], ["ana", 40]],
      [["dee", 30], ["bo", 20], ["cy", 12], ["ana", 5]],
      [["ana", 13], ["bo", 10], ["cy", 8]],
      [["ana", 25], ["bo", 0]],
      [["ana", 50], ["bo", -10]],
      [["b", 100], ["c", 10], ["a", 9]],
      [["ana", 100], ["bo", 3]],
      [["o'brien", 32], ["Acme, Inc.", 30]],
      [["ana", 3000000000], ["bo", 2000000000]],
      [["a", 11], ["h", 8], ["g", 7], ["f", 6], ["e", 5], ["d", 4], ["c", 3], ["b", 2]],
    ],
    hidden: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    private: {
      reference: { "queries/top-customers.sql": `-- Monthly report: revenue by customer, biggest first.
-- orders(id, customer, total)
SELECT customer, SUM(total) AS revenue
FROM orders
GROUP BY customer
ORDER BY revenue DESC;
` },
    },
  }),
  challenge("unpaid-orders", {
    key: "SQL-003",
    schema: "CREATE TABLE orders (\n  id integer PRIMARY KEY,\n  customer text NOT NULL\n);\n\nCREATE TABLE payments (\n  order_id integer NOT NULL REFERENCES orders (id),\n  amount integer NOT NULL\n);",
    title: "Find orders with no matching payment",
    summary: "Reconcile orders against payments before month-end close.",
    kind: "feature",
    difficulty: "medium",
    language: "sql",
    skills: ["joins", "reconciliation"],
    task: `Before the month-end close, finance needs the orders nobody has paid for. Write the query.

The database (PostgreSQL) has two tables:

| table | column | type | meaning |
| --- | --- | --- | --- |
| \`orders\` | \`id\` | \`integer\`, primary key | the order's id |
| \`orders\` | \`customer\` | \`text\`, not null | the customer's name |
| \`payments\` | \`order_id\` | \`integer\`, not null, references \`orders (id)\` | the order the payment is for |
| \`payments\` | \`amount\` | \`integer\`, not null | the amount paid |

\`payments\` has one row per payment, and an order can have any number of payments, including none.

Return one column, the order's \`id\`, with one row for each order that has no payment at all, smallest id first. Any payment counts, whatever its amount, and each unpaid order appears once. Column names don't matter. No unpaid orders gives no rows.`,
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
      { orders: [], payments: [] },
      { orders: [[1, "ana"], [2, "bo"]], payments: [] },
      { orders: [[1, "ana"], [2, "bo"]], payments: [[1, 30], [2, 12]] },
      { orders: [[1, "ana"], [2, "bo"], [3, "cy"]], payments: [[1, 10], [1, 20], [1, 5]] },
      { orders: [[5, "ana"], [2, "bo"], [9, "cy"], [1, "dee"]], payments: [[9, 10]] },
      { orders: [[1, "ana"], [2, "ana"], [3, "bo"]], payments: [[1, 30]] },
      { orders: [[100, "ana"], [10, "bo"], [9, "cy"], [50, "dee"]], payments: [[50, 5]] },
      { orders: [[1, "ana"]], payments: [] },
      { orders: [[1, "ana"]], payments: [[1, 30]] },
      { orders: [[2147483647, "ana"], [1, "bo"]], payments: [[1, 8]] },
      { orders: [[4, "ana"], [5, "bo"], [6, "cy"]], payments: [[4, 10], [4, 15], [6, 3], [6, 3]] },
      { orders: [[1, "c1"], [2, "c2"], [3, "c3"], [4, "c4"], [5, "c5"], [6, "c6"], [7, "c7"], [8, "c8"], [9, "c9"], [10, "c10"]], payments: [[2, 20], [4, 40], [6, 60], [8, 80], [10, 100]] },
    ],
    expected: [
      [[2]],
      [],
      [[1], [2]],
      [],
      [[2], [3]],
      [[1], [2], [5]],
      [[2], [3]],
      [[9], [10], [100]],
      [[1]],
      [],
      [[2147483647]],
      [[5]],
      [[1], [3], [5], [7], [9]],
    ],
    hidden: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    private: {
      reference: { "queries/unpaid-orders.sql": `-- Month-end close: orders that have no matching payment, smallest id first.
-- orders(id, customer), payments(order_id, amount)
SELECT o.id
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE p.order_id IS NULL
ORDER BY o.id;
` },
    },
  }),

  // Edge proxy: systems and performance
  challenge("ring-buffer", {
    key: "C-002",
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
    task: `The edge proxy keeps the most recent request latencies in memory, in a fixed-size ring buffer that overwrites its oldest entry when it is full.

\`ring_buffer(capacity, values, count, out)\` pushes the \`count\` integers in \`values\`, in order, into an empty buffer that holds \`capacity\` entries. A push into a full buffer overwrites the oldest entry. Then it writes what the buffer holds into \`out\`, oldest first, and returns how many entries it wrote.

- \`out\` has room for at least \`count\` integers.
- A capacity of 0 holds nothing.`,
    inputs: [
      [3, [1, 2, 3, 4]],
      [2, []],
      [3, [1, 2, 3]],
      [3, [1, 2]],
      [3, [1, 2, 3, 4, 5, 6]],
      [3, [1, 2, 3, 4, 5, 6, 7]],
      [1, [7, 8, 9]],
      [1, []],
      [5, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]],
      [4, [5, 5, 5, 6]],
      [2, [0, 0, 1]],
      [10, [3, 1, 2]],
      [3, [9, 8, 7, 6]],
      [2, [1, 2, 3, 4, 5]],
      [3, [1000, 2000, 3000, 4000, 5000]],
      [0, [1, 2]],
    ],
    expected: [
      [2, 3, 4],
      [],
      [1, 2, 3],
      [1, 2],
      [4, 5, 6],
      [5, 6, 7],
      [9],
      [],
      [80, 90, 100, 110, 120],
      [5, 5, 5, 6],
      [0, 1],
      [3, 1, 2],
      [8, 7, 6],
      [4, 5],
      [3000, 4000, 5000],
      [],
    ],
    hidden: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    private: {
      reference: {
        "src/ring_buffer.c": `#include <stddef.h>

/* Reverses items[from, to). */
static void reverse(int *items, size_t from, size_t to)
{
    while (from + 1 < to) {
        int held = items[from];
        items[from++] = items[--to];
        items[to] = held;
    }
}

/*
 * Keeps the last \`capacity\` request latencies. Push each value in order, then
 * write the contents oldest first into \`out\` and return how many there are.
 */
size_t ring_buffer(size_t capacity, const int *values, size_t count, int *out)
{
    size_t next = 0;
    size_t size = 0;
    if (capacity == 0)
        return 0;
    /* out is the buffer itself: the oldest entry is overwritten once it is full. */
    for (size_t i = 0; i < count; i++) {
        out[next] = values[i];
        next = (next + 1) % capacity;
        if (size < capacity)
            size++;
    }
    /* Rotate so the oldest entry, at next, comes first. */
    if (size == capacity && next != 0) {
        reverse(out, 0, next);
        reverse(out, next, size);
        reverse(out, 0, size);
    }
    return size;
}
`,
      },
    },
  }),
  challenge("p99-latency", {
    key: "GO-006",
    parameters: ["samples", "p"],
    title: "Compute nearest-rank percentiles for the latency panel",
    summary: "Compute nearest-rank percentiles for the metrics endpoint.",
    kind: "feature",
    difficulty: "medium",
    language: "go",
    skills: ["sorting", "statistics"],
    task: `The latency panel shows percentiles of request latencies, such as the p99.

\`Percentile(samples, p)\` returns the nearest-rank percentile of the latency samples. \`samples\` are in any order and can repeat; \`p\` is greater than 0 and at most 100.

- The value is the one at rank \`ceil(p / 100 × n)\` among the \`n\` samples in ascending order, counting from 1, and \`ok\` is true.
- With no samples, \`ok\` is false (the checks show this as \`null\`).`,
    inputs: [
      [[15, 20, 35, 40, 50], 30],
      [[15, 20, 35, 40, 50], 100],
      [[], 99],
      [[5], 99],
      [[50, 15, 40, 20, 35], 30],
      [Array.from({ length: 100 }, (_, i) => i + 1), 99],
      [Array.from({ length: 100 }, (_, i) => i + 1), 100],
      [Array.from({ length: 100 }, (_, i) => i + 1), 50],
      [[Array.from({ length: 100 }, (_, i) => i + 1), 101].flat(), 99],
      [Array.from({ length: 100 }, (_, i) => i + 1).reverse(), 90],
      [[3, 1, 2], 50],
      [[3, 1, 2], 34],
      [[3, 1, 2], 33],
      [[20, 10], 1],
      [[100, 1], 99],
      [[7, 7, 7, 7], 50],
      [[9, 5, 9, 1, 9, 5], 50],
      [[], 50],
      [[120, 80, 4000, 95, 110, 87, 101, 99, 130, 92], 99],
    ],
    expected: [20, 50, null, 5, 20, 99, 100, 50, 100, 90, 2, 2, 1, 10, 100, 7, 5, null, 4000],
    hidden: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    private: {
      reference: {
        "percentile.go": `package metrics

import (
	"math"
	"sort"
)

// Percentile returns the nearest-rank percentile of the samples: sort them and
// take the value at rank ceil(p / 100 × n), counting from 1. ok is false when
// there are no samples.
func Percentile(samples []int, p float64) (value int, ok bool) {
	if len(samples) == 0 {
		return 0, false
	}
	sorted := append([]int(nil), samples...)
	sort.Ints(sorted)
	rank := int(math.Ceil(p / 100 * float64(len(sorted))))
	if rank < 1 {
		rank = 1
	}
	if rank > len(sorted) {
		rank = len(sorted)
	}
	return sorted[rank-1], true
}
`,
      },
    },
  }),
  challenge("lru-cache", {
    key: "CPP-001",
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
    task: `The cache's hit rate dropped to 12% after the last deploy: entries that were just read get evicted.

\`simulate(capacity, ops)\` runs \`ops\` in order against an empty least-recently-used (LRU) cache that holds at most \`capacity\` entries (at least 1), and returns the result of each get, in order.

- \`["put", key, value]\` stores \`value\` under \`key\`. If the key is already cached, its value is replaced. If the key is new and the cache is full, the least recently used entry is evicted first.
- \`["get", key]\` returns the key's value, or \`-1\` when it isn't cached.
- A put and a get that finds its key both count as a use, making that key the most recently used. A get that misses changes nothing.`,
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
      [2, [["put", 1, 1], ["put", 2, 2], ["put", 1, 10], ["put", 3, 3], ["get", 1], ["get", 2], ["get", 3]]],
      [2, [["put", 1, 1], ["put", 2, 2], ["get", 9], ["put", 3, 3], ["get", 1], ["get", 2], ["get", 3]]],
      [1, [["put", 1, 1], ["get", 1], ["put", 2, 2], ["get", 1], ["get", 2]]],
      [3, [["get", 1]]],
      [2, []],
      [3, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["get", 1], ["get", 2], ["put", 4, 4], ["get", 3], ["get", 1], ["get", 2], ["get", 4]]],
      [2, [["put", 1, 1], ["put", 1, 5], ["get", 1], ["put", 2, 2], ["put", 3, 3], ["get", 1], ["get", 2], ["get", 3]]],
      [2, [["put", 1, 1], ["put", 2, 2], ["put", 2, 20], ["get", 1], ["get", 2]]],
      [2, [["put", 1, 0], ["put", 2, 0], ["get", 1], ["get", 2]]],
      [3, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["get", 1], ["get", 1], ["put", 3, 3], ["put", 4, 4], ["get", 2], ["get", 1], ["get", 3], ["get", 4]]],
      [2, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["put", 4, 4], ["get", 1], ["get", 2], ["get", 3], ["get", 4]]],
      [4, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["put", 4, 4], ["get", 4], ["get", 3], ["get", 2], ["get", 1], ["put", 5, 5], ["get", 4], ["get", 5]]],
      [2, [["put", 7, 70], ["get", 7], ["put", 8, 80], ["get", 7], ["put", 9, 90], ["get", 8], ["get", 7], ["get", 9]]],
    ],
    expected: [
      [1, -1, 1],
      [-1],
      [10, -1, 3],
      [-1, -1, 2, 3],
      [1, -1, 2],
      [-1],
      [],
      [1, 2, -1, 1, 2, 4],
      [5, -1, 2, 3],
      [1, 20],
      [0, 0],
      [1, 1, 1, -1, 1, 3, 4],
      [-1, -1, 3, 4],
      [4, 3, 2, 1, -1, 5],
      [70, 70, -1, 70, 90],
    ],
    hidden: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    private: {
      reference: {
        "src/simulate.cpp": `#include <list>
#include <string>
#include <unordered_map>
#include <utility>
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
    // Most recently used first; the map points into the list.
    std::list<std::pair<int, int>> order;
    std::unordered_map<int, std::list<std::pair<int, int>>::iterator> where;
    std::vector<int> results;
    for (const Op& op : ops) {
        auto found = where.find(op.key);
        if (op.name == "get") {
            if (found == where.end()) {
                results.push_back(-1);
                continue;
            }
            order.splice(order.begin(), order, found->second);
            results.push_back(found->second->second);
        } else if (op.name == "put") {
            if (found != where.end()) {
                found->second->second = op.value;
                order.splice(order.begin(), order, found->second);
                continue;
            }
            if (capacity <= 0) continue;
            if ((int)order.size() >= capacity) {
                where.erase(order.back().first);
                order.pop_back();
            }
            order.emplace_front(op.key, op.value);
            where[op.key] = order.begin();
        }
    }
    return results;
}
`,
      },
    },
  }),
  challenge("parse-duration", {
    key: "GO-004",
    title: "Timeouts in config must be written in seconds",
    summary: "Accept durations like 1h30m in config files.",
    kind: "feature",
    difficulty: "easy",
    language: "go",
    skills: ["parsing", "config"],
    task: `Timeouts in config must be written in seconds, and somebody set \`idle_timeout = 3600\` meaning minutes. Let people write \`1h\`.

\`ParseDuration(text)\` turns a duration such as \`"1h30m"\`, \`"45s"\` or \`"2h"\` into seconds, or returns an error when the text isn't a valid duration (the checks show an error as \`null\`).

- A valid duration is one or more parts written together, each a whole number in digits followed by a unit: \`h\` (hours), \`m\` (minutes) or \`s\` (seconds).
- Each unit appears at most once, in the order \`h\`, \`m\`, \`s\`, and any of them can be left out. A number can be 0 and can be larger than the next unit up.
- Anything else is an error: for example an empty string, a number without a unit, a unit without a number, any other unit or an uppercase one, a sign, a decimal point, spaces, or units repeated or out of order.`,
    inputs: [
      "1h30m",
      "45s",
      "2h",
      "1h1h",
      "90",
      "",
      "30m",
      "1m30s",
      "1h2m3s",
      "2h45s",
      "0s",
      "0h0m0s",
      "90m",
      "100s",
      "1m1h",
      "1s1m",
      "1d",
      "h",
      "1.5h",
      "-1h",
      "1h 30m",
      "1h30",
      "10ms",
      "1H",
    ],
    expected: [
      5400, 45, 7200, null, null, null, 1800, 90, 3723, 7245, 0, 0, 5400, 100, null, null, null,
      null, null, null, null, null, null, null,
    ],
    hidden: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    private: {
      reference: {
        "parse_duration.go": `package config

import "errors"

var errBadDuration = errors.New("durations look like 1h30m: h, m and s, each at most once, in that order")

// ParseDuration turns durations like "1h30m", "45s" or "2h" into seconds.
// Units are h, m and s, each at most once and in that order; anything else
// is an error.
func ParseDuration(text string) (int, error) {
	units := []byte{'h', 'm', 's'}
	seconds := []int{3600, 60, 1}
	if text == "" {
		return 0, errBadDuration
	}
	total, unit, i := 0, 0, 0
	for i < len(text) {
		start, n := i, 0
		for i < len(text) && text[i] >= '0' && text[i] <= '9' {
			n = n*10 + int(text[i]-'0')
			i++
		}
		if i == start || i == len(text) {
			return 0, errBadDuration
		}
		for unit < len(units) && units[unit] != text[i] {
			unit++
		}
		if unit == len(units) {
			return 0, errBadDuration
		}
		total += n * seconds[unit]
		unit++
		i++
	}
	return total, nil
}
`,
      },
    },
  }),
];

const BASE_PROJECTS: SeedProject[] = [
  {
    // The id and key stay from when this was the incident: recorded work names JS-001.
    id: "incident-response",
    key: "INC",
    title: "Checkout",
    summary: "Kettlebrook's checkout API: quotes, shipping and what the payment page charges.",
    story: `Kettlebrook sells mugs, linen and candles. \`checkout-api\` prices every basket: \`POST /quote\` turns a basket into a subtotal, shipping and a total, and the payment page charges exactly that.

- \`src/checkout/quote.js\`: the quote.
- \`src/checkout/shipping.js\`: shipping and its thresholds.
- \`src/checkout/money.js\`: money helpers.
- \`logs/checkout-api.log\`: recent production logs.

Stack: JavaScript.`,
    issues: [],
  },
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

/** Every issue: the ones above, then each project's later issues (content/more). */
export const SEED_ISSUES: SeedIssue[] = [...BASE_ISSUES, ...Object.values(MORE).flat()];

/** Later issues go after a project's first ones, so existing keys never change. */
export const SEED_PROJECTS: SeedProject[] = BASE_PROJECTS.map((project) => ({
  ...project,
  issues: [...project.issues, ...(MORE[project.id] ?? []).map((issue) => issue.id)],
}));
