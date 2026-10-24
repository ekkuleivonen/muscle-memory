/** Shell commands available once setup is done, plus parsing and Tab completion. */
export const COMMANDS = [
  { name: "help", summary: "list commands" },
  { name: "setup", summary: "answer the setup questions again" },
  { name: "profile", summary: "show your answers" },
  { name: "issues", summary: "open the issue list for your stack" },
  {
    name: "data",
    summary: "export or clear everything saved on this device",
    subcommands: ["export", "clear"],
  },
  { name: "clear", summary: "clear the screen" },
] as const;

export function parseCommand(
  line: string,
): { name: string; args: string[] } | null {
  const [name, ...args] = line.trim().split(/\s+/).filter(Boolean);
  return name ? { name: name.toLowerCase(), args } : null;
}

/**
 * Completes the word at the end of the line: one match completes it, several extend it to
 * their common prefix and are returned for display.
 */
export function complete(line: string): { line: string; options: string[] } {
  const words = line.trimStart().split(/\s+/);
  const word = words.at(-1) ?? "";
  let candidates: readonly string[] = [];
  if (words.length === 1) candidates = COMMANDS.map((c) => c.name);
  else if (words.length === 2) {
    const command = COMMANDS.find((c) => c.name === words[0].toLowerCase());
    if (command && "subcommands" in command) candidates = command.subcommands;
  }
  const matches = candidates.filter((c) => c.startsWith(word));
  if (matches.length === 0) return { line, options: [] };
  const head = line.slice(0, line.length - word.length);
  if (matches.length === 1)
    return { line: `${head}${matches[0]} `, options: [] };
  let prefix = matches[0];
  for (const match of matches)
    while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return { line: head + prefix, options: matches };
}
