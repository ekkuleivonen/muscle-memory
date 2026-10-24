import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Catalog } from "../../../packages/catalog/catalog";
import type { LanguageId } from "./languages";
import {
  kebab,
  mediaTypeOf,
  pythonLiteral,
  repoFor,
  snake,
  sqlTables,
  tree,
  type RepoSource,
} from "./repo";

const read = (path: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../content/${path}`, import.meta.url), "utf8"),
  ) as Catalog;
const entries = {
  ...read("catalog/reference.v1.json").entries,
  ...read("demo/catalog.json").entries,
};

/** Every published Challenge with a starter, as the IDE would open it. */
function sources(): RepoSource[] {
  return Object.values(entries)
    .filter((e) => e.kind === "challenge" && e.state === "published")
    .map((e) => e.content as unknown as Record<string, unknown>)
    .filter((c) => typeof c.starter === "string")
    .map((c) => ({
      key: String(c.id).toUpperCase(),
      slug: String(c.id),
      language: c.language as LanguageId,
      entrypoint: String(c.entrypoint),
      starter: String(c.starter),
      task: String(c.task),
      ...(Array.isArray(c.parameters)
        ? { parameters: c.parameters as string[] }
        : {}),
      ...(typeof c.schema === "string" ? { schema: c.schema } : {}),
      ...(typeof c.adapter === "string" ? { adapter: c.adapter } : {}),
      criteria: (c.inputs as unknown[]).map((input, i) => ({
        input,
        expected: (c.expected as unknown[])[i],
      })),
      project: { slug: "proj", title: "Project", story: "About it." },
    }));
}

test("names convert between styles", () => {
  assert.equal(kebab("frequency_map"), "frequency-map");
  assert.equal(kebab("parsePage"), "parse-page");
  assert.equal(snake("ParseLine"), "parse_line");
  assert.equal(snake("debounceTimes"), "debounce_times");
});

test("python literals", () => {
  assert.equal(
    pythonLiteral({ a: [true, false, null], "b'": 1.5 }),
    `{"a": [True, False, None], "b'": 1.5}`,
  );
  assert.equal(pythonLiteral({ __proto__: 2 }), "{}");
  assert.equal(
    pythonLiteral(JSON.parse('{"__proto__": 2}')),
    '{"__proto__": 2}',
  );
});

test("every issue with a starter opens as a repo: readme, solution, tests (and a schema)", () => {
  const all = sources();
  assert.ok(all.length >= 17, `${all.length} starters`);
  for (const src of all) {
    const repo = repoFor(src);
    assert.deepEqual(
      repo.files.map((f) => f.role).sort(),
      src.schema
        ? ["readme", "schema", "solution", "tests"]
        : ["readme", "solution", "tests"],
      src.slug,
    );
    assert.equal(repo.solution.text, src.starter);
    const paths = repo.files.map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, `${src.slug}: ${paths}`);
    const tests = repo.files.find((f) => f.role === "tests")!;
    assert.match(tests.text, new RegExp(src.key), src.slug);
    // Every expected value appears in the test file one way or another.
    assert.ok(tests.text.length > 100, src.slug);
  }
});

test("each language uses its usual layout and test style", () => {
  const bySlug = new Map(sources().map((s) => [s.slug, repoFor(s)]));
  const paths = (slug: string) =>
    bySlug
      .get(slug)!
      .files.map((f) => f.path)
      .sort();
  const testText = (slug: string) =>
    bySlug.get(slug)!.files.find((f) => f.role === "tests")!.text;
  assert.deepEqual(paths("frequency-map"), [
    "README.md",
    "frequency_map.py",
    "tests/test_frequency_map.py",
  ]);
  assert.match(testText("frequency-map"), /@pytest\.mark\.parametrize/);
  assert.match(testText("frequency-map"), /"__proto__": 2/);
  assert.deepEqual(paths("discount-codes"), [
    "README.md",
    "src/apply-discount.test.ts",
    "src/apply-discount.ts",
  ]);
  assert.match(testText("discount-codes"), /from "vitest"/);
  assert.deepEqual(paths("pagination-params"), [
    "README.md",
    "parse_page.go",
    "parse_page_test.go",
  ]);
  assert.match(testText("pagination-params"), /^package accounts$/m);
  assert.match(testText("pagination-params"), /func TestParsePage/);
  assert.match(testText("reset-link-expiry"), /class IsExpiredTest/);
  assert.deepEqual(paths("p99-latency"), [
    "README.md",
    "percentile.go",
    "percentile_test.go",
  ]);
  assert.deepEqual(paths("top-customers"), [
    "README.md",
    "db/schema.sql",
    "queries/top-customers.sql",
    "tests/top-customers.sql",
  ]);
  assert.match(
    testText("top-customers"),
    /INSERT INTO orders \(id, customer, total\) VALUES/,
  );
  // Named parameters spread the case into arguments; otherwise the case is the argument.
  assert.match(testText("discount-codes"), /applyDiscount\(\.\.\.\(input as/);
  assert.match(testText("format-price"), /formatPrice\(input\)/);
  assert.match(testText("reset-link-expiry"), /isExpired\(\.\.\.\$args\)/);
  assert.match(testText("dedupe-customers"), /dedupe\(given\) == expected/);
  assert.match(testText("top-customers"), /--\s+\('ana', 35\)/);
  assert.deepEqual(paths("filter-form-labels"), [
    "README.md",
    "templates/filter-form-labels.html",
    "tests/filter-form-labels.test.js",
  ]);
  assert.match(
    testText("filter-form-labels"),
    /\["form input\[type=checkbox\]", "label", \["in-stock","on-sale"\]\]/,
  );
  assert.equal(bySlug.get("lru-cache")!.branch, "lru-cache-lru-cache");
});

test("sql tables come from the schema", () => {
  assert.deepEqual(
    [
      ...sqlTables(
        `CREATE TABLE orders (id integer PRIMARY KEY, customer text);
CREATE TABLE IF NOT EXISTS "payments" (
  order_id integer REFERENCES orders (id),
  amount numeric(10, 2) NOT NULL,
  PRIMARY KEY (order_id)
);`,
      ),
    ],
    [
      ["orders", ["id", "customer"]],
      ["payments", ["order_id", "amount"]],
    ],
  );
});

test("the explorer shows folders first, then files", () => {
  assert.deepEqual(
    tree(["README.md", "src/a.ts", "src/a.test.ts", "tests/x.py"]),
    [
      {
        name: "src",
        path: "src",
        children: [
          { name: "a.test.ts", path: "src/a.test.ts" },
          { name: "a.ts", path: "src/a.ts" },
        ],
      },
      {
        name: "tests",
        path: "tests",
        children: [{ name: "x.py", path: "tests/x.py" }],
      },
      { name: "README.md", path: "README.md" },
    ],
  );
  assert.equal(mediaTypeOf("python"), "text/x-python; charset=utf-8");
  assert.equal(mediaTypeOf("html"), "text/html; charset=utf-8");
});
