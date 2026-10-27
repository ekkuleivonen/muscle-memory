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
    id: "role",
    message: "What do you do?",
    choices: [
      { value: "student", label: "Student" },
      { value: "software", label: "Software engineer", hint: "apps, web, backend" },
      { value: "data", label: "Data or ML" },
      { value: "infra", label: "Infrastructure", hint: "DevOps, SRE, platform" },
      { value: "qa", label: "Testing and QA" },
      { value: "manager", label: "Engineering manager" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    kind: "select",
    id: "learned",
    message: "How did you mostly learn to code?",
    choices: [
      { value: "degree", label: "A degree" },
      { value: "bootcamp", label: "A bootcamp or course" },
      { value: "self-taught", label: "On my own" },
      { value: "on-the-job", label: "On the job" },
    ],
  },
  {
    kind: "select",
    id: "context",
    message: "Where do you write code most?",
    choices: [
      { value: "company", label: "At an established company" },
      { value: "startup", label: "At a startup" },
      { value: "freelance", label: "Freelance or consulting" },
      { value: "open-source", label: "Open source" },
      { value: "school", label: "At school" },
      { value: "hobby", label: "For myself" },
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
  },  {
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
    id: "aiTools",
    message: "What do you use AI for when coding?",
    choices: [
      { value: "completion", label: "Completion", hint: "suggestions as you type" },
      { value: "chat", label: "Chat", hint: "asking and pasting answers" },
      { value: "agents", label: "Agents", hint: "they edit and run code for you" },
      { value: "review", label: "Review", hint: "checking code you wrote" },
      { value: "none", label: "None of these" },
    ],
    min: 1,
  },
  {
    kind: "select",
    id: "aiShare",
    message: "About how much of the code you ship did an AI write?",
    choices: [
      { value: "none", label: "None" },
      { value: "some", label: "Some", hint: "under a quarter" },
      { value: "half", label: "Around half" },
      { value: "most", label: "Most", hint: "over three quarters" },
      { value: "nearly-all", label: "Nearly all" },
    ],
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
    id: "touchTyping",
    message: "Do you type without looking at the keys?",
    choices: [
      { value: "yes", label: "Yes" },
      { value: "mostly", label: "Mostly" },
      { value: "no", label: "No" },
    ],
  },
  {
    kind: "select",
    id: "age",
    message: "How old are you?",
    choices: [
      { value: "16-17", label: "16–17" },
      { value: "18-24", label: "18–24" },
      { value: "25-34", label: "25–34" },
      { value: "35-44", label: "35–44" },
      { value: "45-54", label: "45–54" },
      { value: "55+", label: "55 or older" },
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
