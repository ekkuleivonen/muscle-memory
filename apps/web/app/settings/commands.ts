import { QUESTIONS } from "../../lib/questions";

/** Settings commands, each its own page at /settings/<name>, in menu order. */
export const COMMANDS = {
  profile: "your answers: experience, work, languages, AI use, editor",
  privacy: "go stealth, Terms and Privacy Notice",
  export: "download everything here as a file, to keep or move",
  import: "restore a downloaded file into this browser",
  logout: "sign out on this device",
  reset: "start over: no progress or saved practice",
  delete: "delete your account and everything here",
} as const;

export type CommandName = keyof typeof COMMANDS;

/** How the list groups them: what you keep here, then the account itself. */
export const GROUPS: { label: string; commands: CommandName[] }[] = [
  { label: "your data", commands: ["profile", "privacy", "export", "import"] },
  { label: "account", commands: ["logout", "reset", "delete"] },
];

/** The commands that can't be undone: they read in red in the list. */
export const DESTRUCTIVE: readonly CommandName[] = ["reset", "delete"];

export function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name);
}

export function isQuestion(id: string): boolean {
  return QUESTIONS.some((question) => question.id === id);
}
