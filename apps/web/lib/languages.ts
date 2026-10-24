/**
 * Languages the editor highlights. Running code is separate: only Python has a runtime today.
 * Colours follow GitHub Linguist, so they read the way developers already know.
 */
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript", color: "#f1e05a" },
  { id: "typescript", label: "TypeScript", color: "#3178c6" },
  { id: "python", label: "Python", color: "#3572a5" },
  { id: "go", label: "Go", color: "#00add8" },
  { id: "rust", label: "Rust", color: "#dea584" },
  { id: "c", label: "C", color: "#555555" },
  { id: "cpp", label: "C++", color: "#f34b7d" },
  { id: "php", label: "PHP", color: "#4f5d95" },
  { id: "sql", label: "SQL", color: "#e38c00" },
  { id: "html", label: "HTML", color: "#e34c26" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];
