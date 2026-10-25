import { QUESTIONS } from "../../lib/questions";

/** Settings commands, each its own page at /settings/<name>, in menu order. */
export const COMMANDS = {
  profile: "your answers: experience, AI use, languages, goal, editor",
  privacy: "go stealth, Terms and Privacy Notice",
  export: "download everything here as a file, to keep or move",
  import: "restore a downloaded file into this browser",
  logout: "sign out on this device",
  reset: "start over: empty board, no saved practice",
  delete: "delete your account and everything here",
} as const;

export type CommandName = keyof typeof COMMANDS;

export function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name);
}

export function isQuestion(id: string): boolean {
  return QUESTIONS.some((question) => question.id === id);
}

/**
 * Where an old `/settings?run=` link goes: a command's page, or the profile page asking one
 * question (`?run=languages` → /settings/profile/languages). Null for anything else.
 */
export function runPath(run: string): string | null {
  if (isCommand(run)) return `/settings/${run}`;
  if (isQuestion(run)) return `/settings/profile/${run}`;
  return null;
}
