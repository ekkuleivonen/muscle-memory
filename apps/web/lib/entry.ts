/**
 * Where a challenge's file lives, as a project in its language would keep it: snake_case
 * Python modules, src/<name>.js, Go files at the root, a Java class in its package's folders.
 * The build uses it to lay out each revision (tools/build-content.ts); read-only source next to
 * the entry imports it by this path.
 */
import type { LanguageId } from "./languages";

/** "text": plain text without highlighting. */
export type FileLanguage = LanguageId | "markdown" | "text";

/** frequency_map → frequency-map; parsePage → parse-page. */
export function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

/** parsePage → parse_page. */
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

export interface EntrySource {
  slug: string;
  language: LanguageId;
  entrypoint: string;
  starter: string;
  /** JavaScript, TypeScript and Python: where the entry lives, when not the default. */
  entry?: string;
}

/** The class a C# or Java starter declares, e.g. "LateFees"; else one named after the method. */
function className(src: EntrySource): string {
  return /\bclass\s+(\w+)/.exec(src.starter)?.[1] ?? pascal(src.entrypoint);
}

export function entryPath(src: EntrySource): string {
  const e = src.entrypoint;
  switch (src.language) {
    case "python":
      return src.entry ?? `${snake(e)}.py`;
    case "javascript":
    case "typescript":
      return src.entry ?? `src/${kebab(e)}.${src.language === "typescript" ? "ts" : "js"}`;
    case "go":
      return `${snake(e)}.go`;
    case "php":
      return `src/${e}.php`;
    case "rust":
      return "src/lib.rs";
    case "c":
      return `src/${snake(e)}.c`;
    case "cpp":
      return `src/${snake(e)}.cpp`;
    case "sql":
      return `queries/${src.slug}.sql`;
    case "ruby":
      return `lib/${snake(e)}.rb`;
    case "java": {
      // Where javac expects it: the package's folders, then the class.
      const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src.starter)?.[1];
      const dir = pkg ? `${pkg.replace(/\./g, "/")}/` : "";
      return `src/main/java/${dir}${className(src)}.java`;
    }
    case "csharp":
      return `src/${className(src)}.cs`;
    case "html":
      return `templates/${src.slug}.html`;
  }
}

/** The media type a code revision is recorded with. */
export function mediaTypeOf(language: LanguageId): string {
  if (language === "html") return "text/html; charset=utf-8";
  return `text/x-${language}; charset=utf-8`;
}
