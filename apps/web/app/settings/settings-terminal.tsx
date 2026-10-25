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
import {
  backupName,
  current,
  makeBackup,
  parseBackup,
  restoreBackup,
  summarize,
} from "../../lib/backup";
import { LEGAL_UPDATED } from "../../lib/legal";
import type { Profile } from "../../lib/profile";
import { logProfile } from "../(browse)/_components/board-log";
import type { Answer, Prompt } from "../_terminal/prompts";
import { QUESTIONS, toProfile } from "../../lib/questions";
import { COMMANDS, type CommandName } from "./commands";
import {
  profileLines,
  TermLink,
  Terminal,
  type TerminalApi,
} from "../_terminal/terminal";

/**
 * Settings as terminal commands, one page each. Without a command it lists them; with one it
 * runs it on a clean screen, then offers the way back. The status bar says where you are. `question` asks just that profile
 * question (/settings/profile/languages), for links from where the answer matters.
 */
export function SettingsTerminal({
  command,
  question,
}: {
  command?: CommandName;
  question?: string;
}) {
  return <Terminal run={(t) => settings(t, command, question)} />;
}

/** What a command leaves behind: done (offer the way back), or it already navigated away. */
type Outcome = "done" | "left";

const RUN: Record<CommandName, (t: TerminalApi) => Promise<Outcome>> = {
  profile: (t) => profile(t),
  privacy,
  export: exportData,
  import: importData,
  logout,
  reset,
  delete: remove,
};

const WIDTH = Math.max(...Object.keys(COMMANDS).map((name) => name.length));

const MENU: Prompt = {
  kind: "select",
  id: "command",
  message: "Pick a command",
  choices: Object.entries(COMMANDS).map(([name, hint]) => ({
    value: name,
    label: name.padEnd(WIDTH),
    hint,
  })),
  escape: "goes back",
};

const DONE: Prompt = {
  kind: "select",
  id: "done",
  message: "Done",
  choices: [{ value: "settings", label: "back to settings" }],
  escape: "goes back too",
};

async function settings(
  t: TerminalApi,
  command?: CommandName,
  question?: string,
) {
  const handle = ensureHandle();
  if (!handle) {
    t.print("", "No account on this device yet.");
    return t.go(
      `/consent?next=${encodeURIComponent(command ? `/settings/${command}` : "/settings")}`,
      "the Terms",
    );
  }
  if (!command) {
    const picked = await t.ask(MENU, { skipped: "closed" });
    if (picked === null) return t.back();
    return t.open(`/settings/${String(picked)}`);
  }
  const outcome = await (question ? profile(t, [question]) : RUN[command](t));
  if (outcome === "left") return;
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

async function privacy(t: TerminalApi): Promise<Outcome> {
  const stored = readProfile();
  const stealth = stored?.stealth === true;
  t.print(
    "What you do here is recorded to run the product: keeping your practice history and making better issues. Community comparisons require published aggregate data; model benchmarks are planned.",
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
      Your runs may be included in future anonymised publications and community
      comparisons. Go stealth to be excluded from both. Recording and uploads
      continue in stealth.
    </span>,
    <span className="t-dim">
      Right now you&apos;re {stealth ? "in stealth" : "eligible for inclusion"}.
    </span>,
    "",
  );
  const share = await t.ask(
    {
      kind: "confirm",
      id: "share",
      message: "Share your anonymised data in stats and comparisons?",
      initial: !stealth,
      escape: "keeps current",
    },
    { skipped: "unchanged" },
  );
  if (share === null) return "done";
  setStealth(!share);
  void logProfile("settings");
  t.print(
    <span className="t-dim">
      {share
        ? "Your runs are eligible for future anonymised publications and community comparisons."
        : "Done, you've gone stealth. We won't include you in our stats or comparisons from now on, including what you've already done, and you won't see other people's stats either."}
    </span>,
  );
  return "done";
}

async function exportData(t: TerminalApi): Promise<Outcome> {
  t.print(
    "Your practice lives in this browser only: no account, no copy on our side you could sign back into. A backup is all of it in one file (handle, answers, board, every recorded keystroke and run), to keep safe or to import in another browser.",
    <span className="t-dim">
      It also holds this browser&apos;s secret key, the one that can delete what
      was uploaded. Keep the file private.
    </span>,
  );
  const backup = await makeBackup();
  const name = backupName(ensureHandle(), new Date());
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  t.print(
    <span className="t-ok">
      Downloaded {name} ({backup.store.records.length} records).
    </span>,
  );
  return "done";
}

/** The browser's file picker; null if closed without a file. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

async function importData(t: TerminalApi): Promise<Outcome> {
  t.print(
    "Importing a backup replaces everything in this browser with what the file holds: you carry on as that handle, where it left off.",
  );
  const go = await t.ask(
    {
      kind: "confirm",
      id: "choose",
      message: "Choose a backup file?",
      initial: true,
    },
    { skipped: "cancelled" },
  );
  if (!go) return "done";
  const file = await pickFile("application/json,.json");
  if (!file) {
    t.print(<span className="t-dim">No file chosen. Nothing changed.</span>);
    return "done";
  }
  const backup = parseBackup(await file.text());
  if (backup instanceof Error) {
    t.print(<span className="t-err">{backup.message}</span>);
    return "done";
  }
  const found = summarize(backup);
  const here = await current();
  t.print(
    <span>
      {file.name}:{" "}
      <span className="t-brand">{found.handle ?? "no handle"}</span>,{" "}
      {found.records} records, saved{" "}
      {new Date(found.exportedAt).toLocaleString()}.
    </span>,
  );
  if (
    here.participantId &&
    here.participantId !== found.participantId &&
    here.records > 0
  )
    t.print(
      <span>
        <span className="t-err">This browser has its own practice</span> (
        {here.records} records as {ensureHandle()}). Importing loses it, and
        with it the key that deletes what it uploaded. Run{" "}
        <span className="t-accent">export</span> first if you want to keep it,
        or <span className="t-accent">delete</span> it.
      </span>,
    );
  const yes = await t.ask({
    kind: "confirm",
    id: "replace",
    message: "Replace everything in this browser with this backup?",
    initial: false,
  });
  if (!yes) {
    t.print(<span className="t-dim">Nothing changed.</span>);
    return "done";
  }
  try {
    await restoreBackup(backup);
  } catch (cause) {
    t.print(
      <span className="t-err">
        {cause instanceof Error
          ? cause.message
          : "The backup could not be restored."}
      </span>,
    );
    return "done";
  }
  t.print(
    <span className="t-ok">
      Restored. Welcome back, {found.handle ?? "you"}.
    </span>,
  );
  // A full load, so every part of the app (and the uploader) starts from the restored state.
  window.location.assign("/dashboard");
  return "left";
}

async function logout(t: TerminalApi): Promise<Outcome> {
  const yes = await t.ask({
    kind: "confirm",
    id: "logout",
    message: "Log out? Everything stays in this browser for when you're back.",
    initial: true,
  });
  if (!yes) return "done";
  logOut();
  t.go("/", "the front door");
  return "left";
}

async function reset(t: TerminalApi): Promise<Outcome> {
  t.print(
    "This empties your board and deletes saved practice and recorded activity from this browser. Your handle and settings stay. Anything already uploaded stays with us until you delete your account.",
  );
  const yes = await t.ask({
    kind: "confirm",
    id: "reset",
    message: "Reset all progress?",
    initial: false,
  });
  if (!yes) {
    t.print(<span className="t-dim">Nothing changed.</span>);
    return "done";
  }
  await resetProgress();
  t.print(<span className="t-ok">Done. Fresh board, same handle.</span>);
  return "done";
}

async function remove(t: TerminalApi): Promise<Outcome> {
  const handle = ensureHandle();
  t.print(
    <span>
      This deletes your handle, profile, board, saved practice and activity from
      this browser and from our servers, and signs you out.{" "}
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
    return "done";
  }
  try {
    await deleteAccount();
  } catch (cause) {
    t.print(
      <span className="t-err">
        {cause instanceof Error
          ? cause.message
          : "Nothing was deleted. Try again later."}
      </span>,
    );
    return "done";
  }
  t.print(<span>Deleted. So long, {handle}.</span>);
  t.go("/", "the front door");
  return "left";
}
