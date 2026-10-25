/**
 * Challenge keys: the language's file extension and a three-digit number, PY-003 or CPP-001.
 * A key is permanent once published: written into the seed, never renumbered, never reused.
 */
export const KEY_CODES: Readonly<Record<string, string>> = {
  python: "PY",
  javascript: "JS",
  typescript: "TS",
  go: "GO",
  sql: "SQL",
  html: "HTML",
  php: "PHP",
  ruby: "RB",
  java: "JAVA",
  csharp: "CS",
  c: "C",
  cpp: "CPP",
  rust: "RS",
};

export const KEY = /^([A-Z]+)-(\d{3})$/;

/** Why `key` cannot name a challenge in `language`, or null when it can. */
export function keyProblem(key: string, language: string): string | null {
  const match = KEY.exec(key);
  if (!match) return `key ${key} is not CODE-NNN, such as PY-003`;
  const code = KEY_CODES[language];
  if (!code) return `language ${language} has no key code`;
  if (match[1] !== code) return `key ${key} should start with ${code}- for ${language}`;
  if (match[2] === "000") return `key ${key} starts numbering at 001`;
  return null;
}
