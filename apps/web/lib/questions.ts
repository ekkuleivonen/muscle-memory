import { RUNNABLE_LANGUAGES } from "../../../packages/runner/engines";
import { LANGUAGES, OFFERED } from "./languages";
import type { Profile } from "./profile";
import type { Answer, Prompt } from "../app/_terminal/prompts";

export const QUESTIONS = [
  {
    kind: "select",
    id: "experience",
    message: "How long have you been writing code?",
    choices: [
      { value: "new", label: "Just starting", hint: "under a year" },
      { value: "some", label: "Getting comfortable", hint: "1–3 years" },
      { value: "professional", label: "Professional", hint: "3–10 years" },
      { value: "veteran", label: "Veteran", hint: "10+ years" },
    ],
  },
  {
    kind: "select",
    id: "aiUse",
    message: "How often do you code with AI help?",
    choices: [
      { value: "daily", label: "Every day" },
      { value: "weekly", label: "Most weeks" },
      { value: "rarely", label: "Now and then" },
      { value: "never", label: "Never" },
    ],
  },
  {
    kind: "multiselect",
    id: "languages",
    message: "Which languages will you be working with?",
    choices: OFFERED.map((id) => ({
      value: id,
      label: LANGUAGES.find((l) => l.id === id)!.label,
      ...(RUNNABLE_LANGUAGES.includes(id) ? {} : { hint: "coming soon" }),
    })),
    min: 1,
  },
  {
    kind: "select",
    id: "goal",
    message: "What brings you here?",
    choices: [
      { value: "sharp", label: "Stay sharp", hint: "keep the muscle memory" },
      { value: "learn", label: "Learn something new" },
      { value: "interview", label: "Prepare for interviews" },
      { value: "fun", label: "Just for fun" },
    ],
  },
  {
    kind: "select",
    id: "editor",
    message: "Which editor keybindings do you want?",
    choices: [
      {
        value: "standard",
        label: "VS Code-style",
        hint: "the usual shortcuts",
      },
      { value: "vim", label: "Vim", hint: "modal editing, hjkl, :w" },
    ],
  },
] as const satisfies readonly Prompt[];

/** Skipped questions are simply absent from the profile. */
export function toProfile(answers: Readonly<Record<string, Answer>>): Profile {
  return Object.fromEntries(
    QUESTIONS.filter((q) => q.id in answers).map((q) => [q.id, answers[q.id]]),
  ) as Profile;
}

/** Label/value rows for showing a profile back to its owner. */
export function describeProfile(profile: Profile): [string, string][] {
  return QUESTIONS.map((question) => {
    const value = profile[question.id as keyof Profile];
    const label = (v: string) =>
      question.choices.find((c) => c.value === v)?.label ?? v;
    const text =
      value === undefined
        ? "skipped"
        : Array.isArray(value)
          ? value.map(label).join(", ")
          : label(value);
    return [question.id, text];
  });
}
