"use client";
import { ensureHandle, readProfile, saveProfile } from "../../lib/account";
import type { Profile } from "../../lib/profile";
import { logProfile } from "../(browse)/_components/board-log";
import type { Answer, Prompt } from "../_terminal/prompts";
import { QUESTIONS, toProfile } from "../../lib/questions";
import {
  profileLines,
  Terminal,
  type TerminalApi,
} from "../_terminal/terminal";

/**
 * The profile questions as terminal prompts, starting from the current answers; `question`
 * asks just that one (/settings/profile/languages). Then the way back to settings.
 */
export function SettingsTerminal({ question }: { question?: string }) {
  return <Terminal run={(t) => run(t, question)} />;
}

type Outcome = "done" | "left";

const DONE: Prompt = {
  kind: "select",
  id: "done",
  message: "Done",
  choices: [{ value: "settings", label: "back to settings" }],
  escape: "goes back too",
};

async function run(t: TerminalApi, question?: string) {
  if (!ensureHandle()) {
    t.print("", "No account on this device yet.");
    return t.go(
      `/consent?next=${encodeURIComponent(location.pathname)}`,
      "the Terms",
    );
  }
  await profile(t, question ? [question] : undefined);
  t.print("");
  await t.ask(DONE, { skipped: "back" });
  t.open("/settings");
}

/** The profile questions again (or just `only`), starting from the current answers. */
async function profile(t: TerminalApi, only?: string[]): Promise<Outcome> {
  const current = readProfile()?.profile ?? {};
  t.print(
    <span className="t-dim">Your answers now:</span>,
    ...profileLines(current),
    <span className="t-dim">
      Enter keeps the highlighted answer · Esc keeps the current one.
    </span>,
    "",
  );
  const answers: Record<string, Answer> = { ...current };
  for (const question of QUESTIONS.filter(
    (q) => !only || only.includes(q.id),
  )) {
    const value = current[question.id as keyof Profile];
    const index = (v: unknown) =>
      question.choices.findIndex((choice) => choice.value === v);
    const prompt: Prompt =
      question.kind === "multiselect"
        ? {
            ...question,
            initialPicked: ((value as string[] | undefined) ?? [])
              .map(index)
              .filter((i) => i >= 0),
            escape: "keeps current",
          }
        : {
            ...question,
            initial: Math.max(0, index(value)),
            escape: "keeps current",
          };
    const answer = await t.ask(prompt, { skipped: "unchanged" });
    if (answer !== null) answers[question.id] = answer;
  }
  saveProfile(toProfile(answers));
  void logProfile("settings");
  t.print(<span className="t-ok">Saved.</span>);
  return "done";
}
