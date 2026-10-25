/**
 * Languages the editor highlights. Colours follow GitHub Linguist, so they read the way
 * developers already know. Which of them run in the browser is up to packages/runner.
 */
export const LANGUAGES = [
  { id: "python", label: "Python", color: "#3572a5" },
  { id: "javascript", label: "JavaScript", color: "#f1e05a" },
  { id: "typescript", label: "TypeScript", color: "#3178c6" },
  { id: "sql", label: "SQL", color: "#e38c00" },
  { id: "html", label: "HTML", color: "#e34c26" },
  { id: "php", label: "PHP", color: "#4f5d95" },
  { id: "ruby", label: "Ruby", color: "#701516" },
  { id: "go", label: "Go", color: "#00add8" },
  { id: "c", label: "C", color: "#555555" },
  { id: "cpp", label: "C++", color: "#f34b7d" },
  { id: "csharp", label: "C#", color: "#178600" },
  { id: "java", label: "Java", color: "#b07219" },
  // Still highlighted for existing issues, but not offered: it cannot run in a browser yet.
  { id: "rust", label: "Rust", color: "#dea584" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

/**
 * The languages people can pick in setup and settings: the ones we run in the browser now or
 * plan to. Those without a runner yet are shown as coming soon.
 */
export const OFFERED: readonly LanguageId[] = [
  "python",
  "javascript",
  "typescript",
  "sql",
  "html",
  "php",
  "ruby",
  "go",
  "c",
  "cpp",
  "csharp",
  "java",
];

/** A file's language in the editor: a challenge's language, or plain text. */
export type FileLanguage = LanguageId | "markdown" | "text";

/** The media type a code revision is recorded with. */
export function mediaTypeOf(language: LanguageId): string {
  if (language === "html") return "text/html; charset=utf-8";
  return `text/x-${language}; charset=utf-8`;
}
