/**
 * The small repo an issue opens as in the IDE: the file you work in, a read-only test file
 * holding the visible cases in that language's usual test style, and the project's README.
 * `repoFor` generates it at authoring time into each revision's workspace (tools/build-content);
 * `repoOf` turns a revision's workspace back into the IDE's view.
 */
import type { FileRole, Workspace } from "../../../packages/content/model";
import type { LanguageId } from "./languages";

/** "text": plain text without highlighting, such as a log file. */
export type FileLanguage = LanguageId | "markdown" | "text";

export interface RepoFile {
  path: string;
  language: FileLanguage;
  text: string;
  /** Only the edit file is editable (and recorded). A schema is read-only, like the tests. */
  role: FileRole;
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
  /** Named when each case's input is a list of arguments; otherwise it is the only one. */
  parameters?: readonly string[];
  /** SQL: CREATE TABLE statements for the tables the cases fill. */
  schema?: string;
  /** C and C++: the adapter from JSON arguments to the function's types. */
  adapter?: string;
  criteria: readonly { input: unknown; expected: unknown; name?: string }[];
  project?: { slug: string; title: string; story?: string };
  /** JavaScript and TypeScript: where the entry file lives, when not src/<entry point>. */
  entry?: string;
  /** Cases CI runs that the test file leaves out. */
  hidden?: number;
  /** More of the repo: source the code uses (read) and documents (docs). */
  files?: readonly RepoFile[];
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

/** parse_page → ParsePage, for class names. */
export function pascal(name: string): string {
  return kebab(name)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
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

function header(comment: string, src: RepoSource): string {
  const hidden = src.hidden ?? 0;
  return hidden
    ? `${comment} Acceptance criteria for ${src.key}. CI runs these cases and ${hidden} more it does not show.`
    : `${comment} Acceptance criteria for ${src.key}. The checks run against these cases.`;
}

function pythonTests(src: RepoSource, module: string): string {
  const cases = src.criteria
    .map(
      (c) => `    (${pythonLiteral(c.input)}, ${pythonLiteral(c.expected)}),`,
    )
    .join("\n");
  return `${header("#", src)}
import pytest

from ${module} import ${src.entrypoint}

CASES = [
${cases}
]


@pytest.mark.parametrize("given, expected", CASES)
def test_${snake(src.entrypoint)}(given, expected):
    assert ${src.entrypoint}(${src.parameters ? "*given" : "given"}) == expected
`;
}

function jsTests(src: RepoSource, module: string, typed: boolean): string {
  // Named cases read as named tests; unnamed ones keep the numbered form.
  const named = src.criteria.some((c) => c.name);
  const cases = src.criteria
    .map((c) =>
      named
        ? `  [${json(c.name ?? "")}, ${json(c.input)}, ${json(c.expected)}],`
        : `  [${json(c.input)}, ${json(c.expected)}],`,
    )
    .join("\n");
  const fn = src.entrypoint;
  const row = named ? "[string, unknown, unknown][]" : "[unknown, unknown][]";
  return `${header("//", src)}
import { describe, expect, it } from "vitest";
import { ${fn} } from "./${module}";

const cases${typed ? `: ${row}` : ""} = [
${cases}
];

describe("${fn}", () => {
  it.each(cases)(${named ? `"%s", (_name, input, expected)` : `"case %#", (input, expected)`} => {
${
  src.parameters
    ? `    expect(${fn}(...${typed ? `(input as Parameters<typeof ${fn}>)` : "input"})).toEqual(expected);`
    : `    expect(${fn}(input${typed ? " as never" : ""})).toEqual(expected);`
}
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

${header("//", src)}
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

${header("//", src)}
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
        $actual = ${src.parameters ? `${src.entrypoint}(...$args)` : `${src.entrypoint}($args)`};
        $this->assertSame(json_decode($expected, true), $actual);
    }
}
`;
}

function rustTests(src: RepoSource, crate: string): string {
  const cases = src.criteria
    .map((c) => `    (${rustString(c.input)}, ${rustString(c.expected)}),`)
    .join("\n");
  return `${header("//", src)}
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

/**
 * C and C++ have no reflection, so each issue's adapter turns a case's JSON arguments into
 * the function's types (with the small mm_json library); the test file is that adapter plus
 * the cases it is run against, one program run per case.
 */
function cTests(src: RepoSource): string {
  const cases = src.criteria
    .map((c) => `    {${cString(c.input)}, ${cString(c.expected)}},`)
    .join("\n");
  return `${header("//", src)}
// Each case runs the program once: the arguments go to mm_call as JSON, and what it
// returns is compared with the expected JSON.

${(src.adapter ?? "").trim()}

/* Arguments and expected result, as JSON. */
static const struct { const char *args; const char *expected; } cases[] = {
${cases}
};
`;
}

function rubyTests(src: RepoSource, file: string): string {
  const cases = src.criteria
    .map((c) => `    [${json(json(c.input))}, ${json(json(c.expected))}],`)
    .join("\n");
  const call = src.parameters ? "*JSON.parse(input)" : "JSON.parse(input)";
  return `${header("#", src)}
require "json"
require_relative "../lib/${file}"

RSpec.describe "${src.entrypoint}" do
  # Input and expected output as JSON.
  [
${cases}
  ].each_with_index do |(input, expected), i|
    it "passes case #{i + 1}" do
      expect(${src.entrypoint}(${call})).to eq(JSON.parse(expected))
    end
  end
end
`;
}

/**
 * Java, like C and C++, calls the method through the issue's adapter (TeaVM keeps no
 * reflection), so its test file is the adapter and the cases it runs against.
 */
function javaTests(src: RepoSource, name: string): string {
  const cases = src.criteria
    .map((c) => `        {${json(json(c.input))}, ${json(json(c.expected))}},`)
    .join("\n");
  return `${header("//", src)}
// Each case runs the program once: the arguments go to Adapter.call as JSON, and what it
// returns is compared with the expected JSON.

${(src.adapter ?? "").trim()}

final class ${name}Cases {
    /** Arguments and expected result, as JSON. */
    static final String[][] CASES = {
${cases}
    };
}
`;
}

/** The class a C# or Java starter declares, e.g. "LateFees"; else one named after the method. */
function className(src: RepoSource): string {
  return /\bclass\s+(\w+)/.exec(src.starter)?.[1] ?? pascal(src.entrypoint);
}

function csharpTests(src: RepoSource, name: string): string {
  const cases = src.criteria
    .map(
      (c) =>
        `    [InlineData(${json(json(c.input))}, ${json(json(c.expected))})]`,
    )
    .join("\n");
  return `${header("//", src)}
using Xunit;

public class ${name}Tests
{
    // Input and expected output as JSON.
    [Theory]
${cases}
    public void ${src.entrypoint}(string input, string expected)
    {
        Assert.Equal(Json.Parse(expected), Json.Call(${className(src)}.${src.entrypoint}, input));
    }
}
`;
}

/** Splits on commas outside parentheses: "a numeric(10, 2), b" → two parts. */
function topLevel(list: string): string[] {
  const parts = [""];
  let depth = 0;
  for (const char of list) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts;
}

/** Table columns from the schema's CREATE TABLE statements. */
export function sqlTables(schema: string): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const match of schema.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s*\(([^;]*)\)\s*;/gi,
  ))
    tables.set(
      match[1],
      topLevel(match[2])
        .map((column) => /^\s*"?(\w+)"?/.exec(column)?.[1] ?? "")
        .filter(
          (name) =>
            name && !/^(primary|foreign|unique|check|constraint)$/i.test(name),
        ),
    );
  return tables;
}

function sqlTests(src: RepoSource): string {
  const tables = sqlTables(src.schema ?? "");
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
  return `${header("--", src)}\n\n${blocks.join("\n\n")}\n`;
}

/** HTML is checked by querying the page, so its tests are a DOM test in JavaScript. */
function htmlTests(src: RepoSource, page: string): string {
  const cases = src.criteria
    .map((c) => {
      const [selector, how] = c.input as [string, string];
      return `  [${json(selector)}, ${json(how)}, ${json(c.expected)}],`;
    })
    .join("\n");
  return `${header("//", src)}
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const { document } = new JSDOM(readFileSync("${page}", "utf8")).window;
const squash = (text) => (text ?? "").replace(/\\s+/g, " ").trim();

/** The name a screen reader announces: aria-labelledby, aria-label, then the label. */
function label(element) {
  const ids = element.getAttribute("aria-labelledby");
  if (ids) return squash(ids.split(/\\s+/).map((id) => document.getElementById(id)?.textContent).join(" "));
  if (element.hasAttribute("aria-label")) return squash(element.getAttribute("aria-label"));
  const tied = element.id && document.querySelector(\`label[for="\${element.id}"]\`);
  const owner = tied || element.closest("label");
  return owner ? squash(owner.textContent) : null;
}

function read(selector, how) {
  const matches = [...document.querySelectorAll(selector)];
  if (how === "count") return matches.length;
  if (how === "text") return matches.map((element) => squash(element.textContent));
  if (how === "label") return matches.map(label);
  return matches.map((element) => element.getAttribute(how));
}

// [selector, what to read, expected]: "count", "text", "label" (the accessible
// name a screen reader announces) or an attribute name.
const cases = [
${cases}
];

describe("${page}", () => {
  it.each(cases)("%s → %s", (selector, how, expected) => {
    expect(read(selector, how)).toEqual(expected);
  });
});
`;
}

function readme(src: RepoSource): RepoFile {
  const project = src.project;
  const text = project
    ? `# ${project.title}\n\n${project.story ?? ""}\n`
    : `# ${src.slug}\n`;
  return { path: "README.md", language: "markdown", text, role: "docs" };
}

/** Where each language keeps the code and its tests. */
function layout(src: RepoSource): {
  solution: string;
  tests: string;
  text: string;
  /** When the tests are written in another language than the solution. */
  testsLanguage?: FileLanguage;
} {
  const e = src.entrypoint;
  switch (src.language) {
    case "python": {
      // At the repo root unless the issue places it in a package; tests import it by module.
      const solution = src.entry ?? `${snake(e)}.py`;
      const module = solution.replace(/\.py$/, "").replace(/\//g, ".");
      return {
        solution,
        tests: `tests/test_${module.replace(/^.*\./, "")}.py`,
        text: pythonTests(src, module),
      };
    }
    case "javascript":
    case "typescript": {
      const ext = src.language === "typescript" ? "ts" : "js";
      // The tests sit next to the entry file and import it by its name.
      const solution = src.entry ?? `src/${kebab(e)}.${ext}`;
      const module = solution.replace(/^.*\//, "").replace(/\.[jt]s$/, "");
      return {
        solution,
        tests: solution.replace(/\.([jt]s)$/, ".test.$1"),
        text: jsTests(src, module, ext === "ts"),
      };
    }
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
        text: cTests(src),
      };
    case "cpp":
      return {
        solution: `src/${snake(e)}.cpp`,
        tests: `tests/${snake(e)}_test.cpp`,
        text: cTests(src),
      };
    case "sql":
      return {
        solution: `queries/${src.slug}.sql`,
        tests: `tests/${src.slug}.sql`,
        text: sqlTests(src),
      };
    case "ruby":
      return {
        solution: `lib/${snake(e)}.rb`,
        tests: `spec/${snake(e)}_spec.rb`,
        text: rubyTests(src, snake(e)),
      };
    case "java": {
      // Where javac expects it: the package's folders, then the class.
      const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src.starter)?.[1];
      const dir = pkg ? `${pkg.replace(/\./g, "/")}/` : "";
      return {
        solution: `src/main/java/${dir}${className(src)}.java`,
        tests: `src/test/java/${dir}${className(src)}Test.java`,
        text: javaTests(src, className(src)),
      };
    }
    case "csharp":
      return {
        solution: `src/${className(src)}.cs`,
        tests: `tests/${className(src)}Tests.cs`,
        text: csharpTests(src, className(src)),
      };
    case "html":
      return {
        solution: `templates/${src.slug}.html`,
        tests: `tests/${src.slug}.test.js`,
        text: htmlTests(src, `templates/${src.slug}.html`),
        testsLanguage: "javascript",
      };
  }
}

export function repoFor(src: RepoSource): Repo {
  const { solution: solutionPath, tests, text, testsLanguage } = layout(src);
  const solution: RepoFile = {
    path: solutionPath,
    language: src.language,
    text: src.starter,
    role: "edit",
  };
  const files: RepoFile[] = [
    readme(src),
    solution,
    {
      path: tests,
      language: testsLanguage ?? src.language,
      text,
      role: "tests",
    },
  ];
  files.push(...(src.files ?? []));
  if (src.schema)
    files.push({
      path: "db/schema.sql",
      language: "sql",
      text: src.schema.endsWith("\n") ? src.schema : `${src.schema}\n`,
      role: "docs",
    });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    root: src.project?.slug ?? src.slug,
    branch: `${src.key.toLowerCase()}-${src.slug}`,
    files,
    solution,
  };
}

/** The IDE's view of a revision's workspace: its files by path, the repo's folder and branch. */
export function repoOf(
  workspace: Workspace,
  issue: { key: string; slug: string },
  root: string,
): Repo {
  const files: RepoFile[] = Object.entries(workspace.files)
    .map(([path, file]) => ({
      path,
      role: file.role,
      language: file.language as FileLanguage,
      text: file.text,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    root,
    branch: `${issue.key.toLowerCase()}-${issue.slug}`,
    files,
    solution: files.find((f) => f.role === "edit")!,
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
