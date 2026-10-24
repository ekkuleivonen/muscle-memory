/** Languages the editor highlights. Running code is separate: only Python has a runtime today. */
export const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "php", label: "PHP" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];
