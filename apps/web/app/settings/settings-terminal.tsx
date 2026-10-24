"use client";
import {
  deleteAccount,
  ensureHandle,
  logOut,
  readProfile,
  resetProgress,
  saveProfile,
  setStealth,
} from "../../lib/account";
import { LEGAL_UPDATED } from "../../lib/legal";
import type { Profile } from "../../lib/onboarding";
import type { Json } from "../../../../packages/domain/json";
import { logProfile } from "../(browse)/_components/board-log";
import type { Answer, Prompt } from "../_terminal/prompts";
import { QUESTIONS, toProfile } from "../_terminal/questions";
import {
  Banner,
  profileLines,
  TermLink,
  Terminal,
  type TerminalApi,
} from "../_terminal/terminal";

/** Settings as terminal commands: pick one, it runs, and the menu comes back. */
export function SettingsTerminal() {
  return <Terminal run={settings} />;
}

/** What a command leaves behind: the menu again, or nothing because it navigated away. */
type Outcome = "menu" | "left";

const COMMANDS: Record<
  string,
  { hint: string; run: (t: TerminalApi) => Promise<Outcome> }
> = {
  profile: { hint: "experience, languages, goal and editor", run: profile },
  privacy: {
    hint: "go stealth, Terms and Privacy Notice",
    run: privacy,
  },
  logout: { hint: "sign out on this device", run: logout },
  reset: { hint: "start over: empty board, no saved practice", run: reset },
  delete: { hint: "delete your account and everything here", run: remove },
  exit: { hint: "back to the app", run: exit },
};

const WIDTH = Math.max(...Object.keys(COMMANDS).map((name) => name.length));

const MENU: Prompt = {
  kind: "select",
  id: "command",
  message: "Pick a command",
  choices: Object.entries(COMMANDS).map(([name, { hint }]) => ({
    value: name,
    label: name.padEnd(WIDTH),
    hint,
  })),
  escape: "closes settings",
};

async function settings(t: TerminalApi) {
  const handle = ensureHandle();
  if (!handle) {
    t.print("", "No account on this device yet.");
    return t.go("/onboarding", "setup");
  }
  t.print(
    <Banner
      description="Settings. Pick a command; Esc takes you back to the app."
      status={
        <>
          <span className="t-on">●</span> signed in as{" "}
          <span className="t-brand">{handle}</span>
        </>
      }
    />,
    "",
  );
  for (;;) {
    const command = await t.ask(MENU, {
      skipped: "closed",
      echo: (answer) => (
        <span>
          <span className="t-accent">~ $</span> {String(answer)}
        </span>
      ),
    });
    const outcome = await (command === null
      ? exit(t)
      : COMMANDS[command as string].run(t));
    if (outcome === "left") return;
    t.print("");
  }
}

/** The setup questions again, starting from the current answers. */
async function profile(t: TerminalApi): Promise<Outcome> {
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
  for (const question of QUESTIONS) {
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
  const saved = saveProfile(toProfile(answers));
  void logProfile({ from: "settings", answers: { ...saved.profile, stealth: saved.stealth ?? false } as Json });
  t.print(<span className="t-ok">Saved.</span>);
  return "menu";
}

async function privacy(t: TerminalApi): Promise<Outcome> {
  const stored = readProfile();
  const stealth = stored?.stealth === true;
  t.print(
    "What you do here is recorded to run the product: picking your next issues, comparing you with other people and LLMs, and making better issues.",
    <span>
      The{" "}
      <TermLink href="/terms" newTab>
        Terms
      </TermLink>{" "}
      and{" "}
      <TermLink href="/privacy" newTab>
        Privacy Notice
      </TermLink>{" "}
      have the details
      {stored?.accepted &&
        `; you accepted the version of ${LEGAL_UPDATED} on ${new Date(stored.accepted.at).toLocaleDateString()}`}
      .
    </span>,
    "",
    <span>
      Your anonymised runs go into the stats we publish and the comparisons
      everyone sees. Or go stealth: you&apos;re left out of both, and in return
      you don&apos;t see anyone else&apos;s stats. Fair&apos;s fair.
    </span>,
    <span className="t-dim">
      Right now you&apos;re {stealth ? "in stealth" : "in the stats"}.
    </span>,
    "",
  );
  const share = await t.ask(
    {
      kind: "confirm",
      id: "share",
      message: "Share your anonymised data in stats and comparisons?",
      initial: true,
      escape: "keeps current",
    },
    { skipped: "unchanged" },
  );
  if (share === null) return "menu";
  setStealth(!share);
  const after = readProfile();
  if (after)
    void logProfile({ from: "settings", answers: { ...after.profile, stealth: after.stealth ?? false } as Json });
  t.print(
    <span className="t-dim">
      {share
        ? "You're in the stats. Thanks: your runs make the comparisons (and the issues) better."
        : "Done, you've gone stealth. We won't include you in our stats or comparisons from now on, including what you've already done, and you won't see other people's stats either."}
    </span>,
  );
  return "menu";
}

async function logout(t: TerminalApi): Promise<Outcome> {
  const yes = await t.ask({
    kind: "confirm",
    id: "logout",
    message: "Log out? Everything stays in this browser for when you're back.",
    initial: true,
  });
  if (!yes) return "menu";
  logOut();
  t.go("/onboarding", "the front door");
  return "left";
}

async function reset(t: TerminalApi): Promise<Outcome> {
  t.print(
    "This empties your board and deletes saved practice and recorded activity. Your handle and settings stay.",
  );
  const yes = await t.ask({
    kind: "confirm",
    id: "reset",
    message: "Reset all progress?",
    initial: false,
  });
  if (!yes) {
    t.print(<span className="t-dim">Nothing changed.</span>);
    return "menu";
  }
  await resetProgress();
  t.print(<span className="t-ok">Done. Fresh board, same handle.</span>);
  return "menu";
}

async function remove(t: TerminalApi): Promise<Outcome> {
  const handle = ensureHandle();
  t.print(
    <span>
      This deletes your handle, profile, board, saved practice and activity from
      this browser, and signs you out.{" "}
      <span className="t-err">It can&apos;t be undone.</span> Published
      anonymised datasets aren&apos;t linked to you, so they stay.
    </span>,
  );
  const typed = await t.ask(
    {
      kind: "text",
      id: "delete",
      message: `Type ${handle} to confirm:`,
      escape: "cancels",
    },
    { skipped: "cancelled" },
  );
  if (typed !== handle) {
    if (typed !== null)
      t.print(
        <span className="t-dim">That&apos;s not it. Nothing was deleted.</span>,
      );
    return "menu";
  }
  await deleteAccount();
  t.print(<span>Deleted. So long, {handle}.</span>);
  t.go("/onboarding", "the front door");
  return "left";
}

async function exit(t: TerminalApi): Promise<Outcome> {
  t.back();
  return "left";
}
