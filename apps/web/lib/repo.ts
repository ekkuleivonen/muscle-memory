/**
 * The small repo an issue opens as in the IDE: the file you work in, a read-only test file
 * holding the acceptance criteria in that language's usual test style, and the project's
 * README. Generated from the Challenge, so content needs nothing more than a starter.
 */
import type { LanguageId } from "./languages";

export type FileLanguage = LanguageId | "markdown";

export interface RepoFile {
  path: string;
  language: FileLanguage;
  text: string;
  /** Only the solution is editable (and recorded). */
  role: "solution" | "tests" | "readme";
}

export interface Repo {
  /** Folder name at the top of the explorer: the project's slug. */
  root: string;
  /** Like a feature branch: fn-1-frequency-map. */
  branch: string;
  files: RepoFile[];
  solution: RepoFile;
}

export interface RepoSource {
  key: string;
  slug: string;
  language: LanguageId;
  entrypoint: string;
  starter: string;
  task: string;
  criteria: readonly { input: unknown; expected: unknown }[];
  project?: { slug: string; title: string; story?: string };
}

/** frequency_map → frequency-map; parsePage → parse-page. */
export function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function snake(name: string): string {
  return kebab(name).replace(/-/g, "_");
}

const json = (value: unknown) => JSON.stringify(value);

/** A JSON value as a Python literal (True, False, None; strings via JSON escapes). */
export function pythonLiteral(value: unknown): string {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(", ")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${json(k)}: ${pythonLiteral(v)}`)
      .join(", ")}}`;
  return json(value);
}

/** Go and Rust raw strings cannot hold a backtick or a quote-hash; fall back to escapes. */
const goString = (value: unknown) => {
  const text = json(value);
  return text.includes("`") ? json(text) : `\`${text}\``;
};
const rustString = (value: unknown) => {
  const text = json(value);
  return text.includes('"#') ? json(text) : `r#"${text}"#`;
};
const cString = (value: unknown) => json(json(value));
const sqlString = (value: unknown) =>
  typeof value === "string"
    ? `'${value.replace(/'/g, "''")}'`
    : value === null
      ? "NULL"
      : String(value);

function header(comment: string, key: string): string {
  return `${comment} Acceptance criteria for ${key}. The checks run against these cases.`;
}

function pythonTests(src: RepoSource, module: string): string {
  const cases = src.criteria
    .map(
      (c) => `    (${pythonLiteral(c.input)}, ${pythonLiteral(c.expected)}),`,
    )
    .join("\n");
  return `${header("#", src.key)}
import pytest

from ${module} import ${src.entrypoint}

CASES = [
${cases}
]


@pytest.mark.parametrize("given, expected", CASES)
def test_${snake(src.entrypoint)}(given, expected):
    assert ${src.entrypoint}(given) == expected
`;
}

function jsTests(src: RepoSource, module: string, typed: boolean): string {
  const cases = src.criteria
    .map((c) => `  [${json(c.input)}, ${json(c.expected)}],`)
    .join("\n");
  const fn = src.entrypoint;
  return `${header("//", src.key)}
import { describe, expect, it } from "vitest";
import { ${fn} } from "./${module}";

const cases${typed ? ": [unknown, unknown][]" : ""} = [
${cases}
];

describe("${fn}", () => {
  it.each(cases)("case %#", (input, expected) => {
    // An array holds the arguments; anything else is the only argument.
    const args = Array.isArray(input) ? input : [input];
    expect(${fn}(...${typed ? `(args as Parameters<typeof ${fn}>)` : "args"})).toEqual(expected);
  });
});
`;
}

function goTests(src: RepoSource): string {
  const pkg = /^package (\w+)/m.exec(src.starter)?.[1] ?? "main";
  const cases = src.criteria
    .map((c) => `\t{${goString(c.input)}, ${goString(c.expected)}},`)
    .join("\n");
  return `package ${pkg}

import "testing"

${header("//", src.key)}
// Input and expected output are JSON.
var ${src.entrypoint.charAt(0).toLowerCase() + src.entrypoint.slice(1)}Cases = []struct {
	input string
	want  string
}{
${cases}
}

func Test${src.entrypoint}(t *testing.T) {
	for _, c := range ${src.entrypoint.charAt(0).toLowerCase() + src.entrypoint.slice(1)}Cases {
		t.Run(c.input, func(t *testing.T) {
			assertJSON(t, ${src.entrypoint}, c.input, c.want)
		})
	}
}
`;
}

const phpQuote = (text: string) =>
  `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function phpTests(src: RepoSource): string {
  const cases = src.criteria
    .map(
      (c, i) =>
        `            'case ${i + 1}' => [${phpQuote(json(c.input))}, ${phpQuote(json(c.expected))}],`,
    )
    .join("\n");
  const name = src.entrypoint.charAt(0).toUpperCase() + src.entrypoint.slice(1);
  return `<?php

declare(strict_types=1);

use PHPUnit\\Framework\\Attributes\\DataProvider;
use PHPUnit\\Framework\\TestCase;

${header("//", src.key)}
final class ${name}Test extends TestCase
{
    /** [arguments, expected] as JSON. */
    public static function cases(): array
    {
        return [
${cases}
        ];
    }

    #[DataProvider('cases')]
    public function test${name}(string $input, string $expected): void
    {
        $args = json_decode($input, true);
        $actual = ${src.entrypoint}(...(is_array($args) ? $args : [$args]));
        $this->assertSame(json_decode($expected, true), $actual);
    }
}
`;
}

function rustTests(src: RepoSource, crate: string): string {
  const cases = src.criteria
    .map((c) => `    (${rustString(c.input)}, ${rustString(c.expected)}),`)
    .join("\n");
  return `${header("//", src.key)}
use ${crate}::${src.entrypoint};

/// Input and expected output as JSON.
const CASES: &[(&str, &str)] = &[
${cases}
];

#[test]
fn ${src.entrypoint}_matches_every_case() {
    for (input, want) in CASES {
        assert_json(${src.entrypoint}, input, want);
    }
}
`;
}

function cTests(src: RepoSource, header_: string, cpp: boolean): string {
  const cases = src.criteria
    .map((c) => `    {${cString(c.input)}, ${cString(c.expected)}},`)
    .join("\n");
  return `${header("//", src.key)}
#include ${cpp ? "<cassert>" : "<assert.h>"}
#include "${header_}"

/* Input and expected output as JSON. */
static const struct { const char *input; const char *expected; } cases[] = {
${cases}
};

int main(void)
{
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++)
        assert(check_${src.entrypoint}(cases[i].input, cases[i].expected));
    return 0;
}
`;
}

/** Table columns from the task, e.g. "orders(id, customer, total)". */
export function sqlTables(task: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const match of task.matchAll(/`?(\w+)\(([\w\s,]+)\)`?/g))
    tables.set(
      match[1],
      match[2].split(",").map((column) => column.trim()),
    );
  return tables;
}

function sqlTests(src: RepoSource): string {
  const tables = sqlTables(src.task);
  const blocks = src.criteria.map((c, i) => {
    const input = (c.input ?? {}) as Record<string, unknown[][]>;
    const inserts = Object.entries(input).map(([table, rows]) => {
      const columns = tables.get(table);
      const values = rows.map((row) => `(${row.map(sqlString).join(", ")})`);
      return values.length
        ? `INSERT INTO ${table}${columns ? ` (${columns.join(", ")})` : ""} VALUES\n  ${values.join(",\n  ")};`
        : `-- ${table}: no rows`;
    });
    const expected = (c.expected as unknown[][])
      .map((row) => `--   (${row.map(sqlString).join(", ")})`)
      .join("\n");
    return `-- Case ${i + 1}\nBEGIN;\n${inserts.join("\n")}\n-- Expected rows, in order:\n${expected || "--   (none)"}\nROLLBACK;`;
  });
  return `${header("--", src.key)}\n\n${blocks.join("\n\n")}\n`;
}

function htmlTests(src: RepoSource): string {
  const blocks = src.criteria.map(
    (c, i) => `<!-- Case ${i + 1}: ${json(c.input)} -->\n${String(c.expected)}`,
  );
  return `<!-- ${header("", src.key).trim()} -->\n\n${blocks.join("\n\n")}\n`;
}

function readme(src: RepoSource): RepoFile {
  const project = src.project;
  const text = project
    ? `# ${project.title}\n\n${project.story ?? ""}\n`
    : `# ${src.slug}\n`;
  return { path: "README.md", language: "markdown", text, role: "readme" };
}

/** Where each language keeps the code and its tests. */
function layout(src: RepoSource): {
  solution: string;
  tests: string;
  text: string;
} {
  const e = src.entrypoint;
  switch (src.language) {
    case "python":
      return {
        solution: `${snake(e)}.py`,
        tests: `tests/test_${snake(e)}.py`,
        text: pythonTests(src, snake(e)),
      };
    case "javascript":
      return {
        solution: `src/${kebab(e)}.js`,
        tests: `src/${kebab(e)}.test.js`,
        text: jsTests(src, kebab(e), false),
      };
    case "typescript":
      return {
        solution: `src/${kebab(e)}.ts`,
        tests: `src/${kebab(e)}.test.ts`,
        text: jsTests(src, kebab(e), true),
      };
    case "go":
      return {
        solution: `${snake(e)}.go`,
        tests: `${snake(e)}_test.go`,
        text: goTests(src),
      };
    case "php":
      return {
        solution: `src/${e}.php`,
        tests: `tests/${e.charAt(0).toUpperCase() + e.slice(1)}Test.php`,
        text: phpTests(src),
      };
    case "rust":
      return {
        solution: "src/lib.rs",
        tests: `tests/${snake(e)}.rs`,
        text: rustTests(src, snake(src.slug)),
      };
    case "c":
      return {
        solution: `src/${snake(e)}.c`,
        tests: `tests/test_${snake(e)}.c`,
        text: cTests(src, `../src/${snake(e)}.h`, false),
      };
    case "cpp":
      return {
        solution: `src/${snake(e)}.cpp`,
        tests: `tests/${snake(e)}_test.cpp`,
        text: cTests(src, `../src/${snake(e)}.hpp`, true),
      };
    case "sql":
      return {
        solution: `queries/${src.slug}.sql`,
        tests: `tests/${src.slug}.sql`,
        text: sqlTests(src),
      };
    case "html":
      return {
        solution: `templates/${src.slug}.html`,
        tests: `tests/${src.slug}.expected.html`,
        text: htmlTests(src),
      };
  }
}

export function repoFor(src: RepoSource): Repo {
  const { solution: solutionPath, tests, text } = layout(src);
  const solution: RepoFile = {
    path: solutionPath,
    language: src.language,
    text: src.starter,
    role: "solution",
  };
  const files = [
    readme(src),
    solution,
    { path: tests, language: src.language, text, role: "tests" as const },
  ].sort((a, b) => a.path.localeCompare(b.path));
  return {
    root: src.project?.slug ?? src.slug,
    branch: `${src.key.toLowerCase()}-${src.slug}`,
    files,
    solution,
  };
}

export interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

/** Paths as a folder tree, folders first, then files, each alphabetical. */
export function tree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    let level = root;
    const parts = path.split("/");
    parts.forEach((name, index) => {
      const at = parts.slice(0, index + 1).join("/");
      let node = level.find((n) => n.name === name);
      if (!node) {
        node =
          index < parts.length - 1
            ? { name, path: at, children: [] }
            : { name, path: at };
        level.push(node);
      }
      if (node.children) level = node.children;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort(
        (a, b) =>
          Number(!a.children) - Number(!b.children) ||
          a.name.localeCompare(b.name),
      )
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root);
}

/** The media type a code revision is recorded with. */
export function mediaTypeOf(language: LanguageId): string {
  if (language === "html") return "text/html; charset=utf-8";
  return `text/x-${language}; charset=utf-8`;
}
