"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  deleteAccount,
  logOut,
  readProfile,
  resetProgress,
  saveProfile,
  setStealth,
} from "../../lib/account";
import type { StoredProfile } from "../../lib/profile";
import {
  backupName,
  current,
  makeBackup,
  parseBackup,
  restoreBackup,
  summarize,
  type Backup,
  type BackupSummary,
} from "../../lib/backup";
import { LEGAL_UPDATED } from "../../lib/legal";
import type { Profile } from "../../lib/profile";
import { QUESTIONS, toProfile } from "../../lib/questions";
import type { Answer } from "../_terminal/prompts";
import { logProfile } from "../../lib/site-log";
import type { CommandName } from "./commands";
import { KeyActions, type KeyAction } from "../_terminal/key-actions";

/**
 * Settings commands as pages in the terminal's look: what the command does, where things
 * stand, one line saying what happened, then the actions as a prompt's choices, run by key or
 * click (KeyActions), ending with the way back. Profile has its own form.
 */
export function SettingsCommand({
  command,
  question,
}: {
  command: CommandName;
  /** Profile only: ask just this question (/settings/profile/languages). */
  question?: string;
}) {
  if (command === "profile")
    return (
      <Account>
        <ProfileForm only={question} />
      </Account>
    );
  const Page = PAGES[command];
  return (
    <Account>
      <Page />
    </Account>
  );
}

const PAGES: Record<Exclude<CommandName, "profile">, () => ReactNode> = {
  privacy: Privacy,
  export: Export,
  import: Import,
  logout: Logout,
  reset: Reset,
  delete: Delete,
};

/** The page's frame: the title, then the command. */
export function SettingsFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="t-prose t-settings">
      <h1 className="t-doc-title">{title}</h1>
      {children}
    </main>
  );
}

/** Commands need an account on this device; read after mount, like all browser storage. */
export function Account({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"reading" | "none" | "ok">("reading");
  useEffect(() => setState(readProfile() ? "ok" : "none"), []);
  if (state === "reading") return null;
  if (state === "none")
    return (
      <main className="t-prose t-settings">
        <p className="t-line">No account on this device yet.</p>
        <p className="t-line">
          <Link
            href={`/consent?next=${encodeURIComponent(location.pathname)}`}
            className="t-cmd"
          >
            Accept the Terms to start
          </Link>
        </p>
      </main>
    );
  return <>{children}</>;
}

type Tone = "ok" | "err" | "dim";
/** What the last action did, in one line. */
function Result({
  result,
}: {
  result: { tone: Tone; text: ReactNode } | null;
}) {
  if (!result) return null;
  return (
    <p className={`t-line t-result t-${result.tone}`} role="status">
      {result.text}
    </p>
  );
}

/** The page's actions, then the way back to settings, which Esc also takes. */
function Actions({
  id,
  message,
  actions,
  autoFocus = true,
  handle,
}: {
  id: string;
  message?: string;
  actions: readonly KeyAction[];
  autoFocus?: boolean;
  handle?: Ref<{ focus(): void }>;
}) {
  const router = useRouter();
  const back = () => router.push("/settings");
  return (
    <KeyActions
      ref={handle}
      id={id}
      message={message}
      autoFocus={autoFocus}
      actions={[...actions, { label: "back to settings", run: back }]}
      onEscape={back}
    />
  );
}

function Privacy() {
  const [stored, setStored] = useState<StoredProfile | null>(null);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  useEffect(() => setStored(readProfile()), []);
  const stealth = stored?.stealth === true;
  const choose = (share: boolean) => {
    setStealth(!share);
    void logProfile("settings");
    setStored(readProfile());
    setResult({
      tone: "dim",
      text: share
        ? "Your runs are eligible for future anonymised publications and community comparisons."
        : "Done, you've gone stealth. We won't include you in published stats or comparisons from now on, including what you've already done, and you won't see other people's stats either.",
    });
  };
  return (
    <SettingsFrame title="Privacy">
      <p>
        What you do here is recorded to run the product: keeping your practice
        history and making better challenges. Community comparisons require
        published aggregate data; model benchmarks are planned.
      </p>
      <p>
        The{" "}
        <Link href="/terms" className="t-cmd">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="t-cmd">
          Privacy Notice
        </Link>{" "}
        have the details
        {stored?.accepted &&
          `; you accepted the version of ${LEGAL_UPDATED} on ${new Date(stored.accepted.at).toLocaleDateString()}`}
        .
      </p>
      <p>
        Your runs may be included in future anonymised publications and
        community comparisons. Go stealth to be excluded from both. Recording
        and uploads continue in stealth.
      </p>
      <p className="t-state">
        Right now you&apos;re{" "}
        <strong>{stealth ? "in stealth" : "eligible for inclusion"}</strong>.
      </p>
      <Result result={result} />
      <Actions
        id="privacy"
        actions={[
          stealth
            ? {
                label: "share my anonymised data",
                kind: "primary",
                run: () => choose(true),
              }
            : {
                label: "go stealth",
                kind: "primary",
                run: () => choose(false),
              },
        ]}
      />
    </SettingsFrame>
  );
}

function Export() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  const download = async () => {
    setBusy(true);
    try {
      const backup = await makeBackup();
      const name = backupName(new Date());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setResult({
        tone: "ok",
        text: `Downloaded ${name} (${backup.store.records.length} records).`,
      });
    } catch (cause) {
      setResult({
        tone: "err",
        text:
          cause instanceof Error
            ? cause.message
            : "The backup couldn't be made.",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsFrame title="Export">
      <p>
        Your practice lives in this browser only: no account, no copy on our
        side you could sign back into. A backup is all of it in one file
        (answers, progress, stars and the practice this browser keeps), to keep safe or to
        import in another browser.
      </p>
      <p className="t-dim">
        It also holds this browser&apos;s secret key, the one that can delete
        what was uploaded. Keep the file private.
      </p>
      <Result result={result} />
      <Actions
        id="export"
        actions={[
          {
            label: "download backup",
            kind: "primary",
            disabled: busy && "preparing…",
            run: () => void download(),
          },
        ]}
      />
    </SettingsFrame>
  );
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

function Import() {
  const [picked, setPicked] = useState<{
    name: string;
    backup: Backup;
    found: BackupSummary;
    own: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  const choose = async () => {
    setResult(null);
    const file = await pickFile("application/json,.json");
    if (!file) {
      setResult({ tone: "dim", text: "No file chosen. Nothing changed." });
      return;
    }
    const backup = parseBackup(await file.text());
    if (backup instanceof Error) {
      setResult({ tone: "err", text: backup.message });
      return;
    }
    const found = summarize(backup);
    const here = await current();
    const own =
      here.participantId &&
      here.participantId !== found.participantId &&
      here.records > 0
        ? here.records
        : 0;
    setPicked({ name: file.name, backup, found, own });
  };
  const replace = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await restoreBackup(picked.backup);
    } catch (cause) {
      setBusy(false);
      setResult({
        tone: "err",
        text:
          cause instanceof Error
            ? cause.message
            : "The backup could not be restored.",
      });
      return;
    }
    setResult({ tone: "ok", text: "Restored." });
    // A full load, so every part of the app (and the uploader) starts from the restored state.
    window.location.assign("/challenges");
  };
  return (
    <SettingsFrame title="Import">
      <p>
        Importing a backup replaces everything in this browser with what the
        file holds: you carry on where it left off.
      </p>
      {!picked ? (
        <>
          <Result result={result} />
          <Actions
            id="import"
            actions={[
              {
                label: "choose backup file",
                kind: "primary",
                run: () => void choose(),
              },
            ]}
          />
        </>
      ) : (
        <>
          <p className="t-state">
            {picked.name}: {picked.found.records} records, saved{" "}
            {new Date(picked.found.exportedAt).toLocaleString()}.
          </p>
          {picked.own > 0 && (
            <p>
              <span className="t-err">This browser has its own practice</span> (
              {picked.own} records). Importing loses it, and with it the key
              that deletes what it uploaded.{" "}
              <Link href="/settings/export" className="t-cmd">
                Export
              </Link>{" "}
              it first if you want to keep it.
            </p>
          )}
          <Result result={result} />
          <Actions
            id="import-confirm"
            message="Replace everything in this browser with this backup?"
            actions={[
              {
                label: "yes, replace everything",
                kind: "danger",
                key: "y",
                disabled: busy && "restoring…",
                run: () => void replace(),
              },
              {
                label: "cancel",
                key: "n",
                disabled: busy && "restoring…",
                run: () => {
                  setPicked(null);
                  setResult({ tone: "dim", text: "Nothing changed." });
                },
              },
            ]}
          />
        </>
      )}
    </SettingsFrame>
  );
}

function Logout() {
  const router = useRouter();
  return (
    <SettingsFrame title="Log out">
      <p>
        Signs you out on this device. Everything stays in this browser for when
        you&apos;re back.
      </p>
      <Actions
        id="logout"
        actions={[
          {
            label: "log out",
            kind: "primary",
            run: () => {
              logOut();
              router.push("/");
            },
          },
        ]}
      />
    </SettingsFrame>
  );
}

function Reset() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  const reset = async () => {
    setBusy(true);
    await resetProgress();
    setBusy(false);
    setAsking(false);
    setResult({ tone: "ok", text: "Done. Progress cleared." });
  };
  return (
    <SettingsFrame title="Reset">
      <p>
        This clears your progress and deletes saved practice and recorded activity
        from this browser. Your settings stay. Anything already uploaded stays
        with us until you delete your account.
      </p>
      <Result result={result} />
      {!asking ? (
        <Actions
          id="reset"
          actions={[
            {
              label: "reset all progress",
              kind: "danger",
              run: () => {
                setResult(null);
                setAsking(true);
              },
            },
          ]}
        />
      ) : (
        <Actions
          id="reset-confirm"
          message="Sure? This can't be undone."
          actions={[
            {
              label: "yes, reset",
              kind: "danger",
              key: "y",
              disabled: busy && "resetting…",
              run: () => void reset(),
            },
            {
              label: "cancel",
              key: "n",
              disabled: busy && "resetting…",
              run: () => {
                setAsking(false);
                setResult({ tone: "dim", text: "Nothing changed." });
              },
            },
          ]}
        />
      )}
    </SettingsFrame>
  );
}

const DELETE_WORD = "delete";

function Delete() {
  const router = useRouter();
  const actions = useRef<{ focus(): void }>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount();
    } catch (cause) {
      setBusy(false);
      setResult({
        tone: "err",
        text:
          cause instanceof Error
            ? cause.message
            : "Nothing was deleted. Try again later.",
      });
      return;
    }
    setResult({ tone: "ok", text: "Deleted. Taking you to the front door…" });
    setTimeout(() => router.push("/"), 900);
  };
  return (
    <SettingsFrame title="Delete account">
      <p>
        This deletes your profile, progress, stars, saved practice and activity from this
        browser and from our servers, and signs you out.{" "}
        <span className="t-err">It can&apos;t be undone.</span> Published
        anonymised datasets aren&apos;t linked to you, so they stay.
      </p>
      <label className="t-field">
        <span>
          <span className="t-accent">?</span> Type{" "}
          <strong>{DELETE_WORD}</strong> to confirm, then Enter
        </span>
        <input
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            // Enter moves on to the actions, never deletes from the field.
            if (event.key !== "Enter") return;
            event.preventDefault();
            actions.current?.focus();
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <Result result={result} />
      <Actions
        id="delete"
        autoFocus={false}
        handle={actions}
        actions={[
          {
            label: "delete everything",
            kind: "danger",
            disabled: busy
              ? "deleting…"
              : typed.trim() !== DELETE_WORD && `type ${DELETE_WORD} first`,
            run: () => void remove(),
          },
        ]}
      />
    </SettingsFrame>
  );
}

/**
 * The profile questions as one form, current answers ticked; `only` shows just one. Saving
 * stores every answer shown, as the questions asked one at a time did. A question never
 * answered stays unanswered unless something is picked.
 */
function ProfileForm({ only }: { only?: string }) {
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null);
  const [saved, setSaved] = useState<Profile>({});
  const options = useRef<HTMLDivElement>(null);
  const actions = useRef<{ focus(): void }>(null);
  const router = useRouter();
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  useEffect(() => {
    const current = readProfile()?.profile ?? {};
    setSaved(current);
    setAnswers({ ...current } as Record<string, Answer>);
  }, []);
  // The keyboard starts on the first option, as a prompt would.
  const ready = answers !== null;
  useEffect(() => {
    if (ready)
      options.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
  }, [ready]);
  if (!answers) return null;
  /** ↑↓ or j/k move through every option, across questions; Enter picks like Space. */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const inputs = [
      ...(options.current?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ];
    const at = inputs.indexOf(document.activeElement as HTMLInputElement);
    if (at < 0) return;
    const step =
      event.key === "ArrowDown" || event.key === "j"
        ? 1
        : event.key === "ArrowUp" || event.key === "k"
          ? -1
          : 0;
    if (step) {
      event.preventDefault();
      // Past the last option, on to the actions.
      if (at + step >= inputs.length) return actions.current?.focus();
      inputs[Math.max(0, at + step)]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      inputs[at].click();
    }
  };
  const shown = QUESTIONS.filter((q) => !only || q.id === only);
  const pick = (id: string, value: string, multi: boolean) => {
    setResult(null);
    setAnswers((current) => {
      const next = { ...current };
      if (!multi) next[id] = value;
      else {
        const list = (next[id] as string[] | undefined) ?? [];
        // "none" excludes the rest, and the rest exclude it.
        next[id] = list.includes(value)
          ? list.filter((v) => v !== value)
          : value === "none"
            ? ["none"]
            : [...list.filter((v) => v !== "none"), value];
      }
      return next;
    });
  };
  const save = () => {
    const next = { ...answers };
    for (const question of shown) {
      if (question.kind !== "multiselect") continue;
      const list = (next[question.id] as string[] | undefined) ?? [];
      if (list.length >= question.min) continue;
      // Never answered and still nothing picked: leave it unanswered.
      if (saved[question.id as keyof Profile] === undefined && !list.length) {
        delete next[question.id];
        continue;
      }
      setResult({
        tone: "err",
        text: `Pick at least ${question.min}: ${question.message}`,
      });
      return;
    }
    saveProfile(toProfile(next));
    void logProfile("settings");
    setSaved(toProfile(next));
    setResult({ tone: "ok", text: "Saved." });
  };
  return (
    <SettingsFrame title={only ? "Profile question" : "Profile"}>
      <p className="t-dim">
        Every question is optional. Your answers let us compare groups (never
        people): change any of them, then save.
      </p>
      <div ref={options} onKeyDown={onKeyDown}>
        {shown.map((question) => {
          const multi = question.kind === "multiselect";
          const value = answers[question.id];
          return (
            <fieldset key={question.id} className="t-question">
              <legend>{question.message}</legend>
              {question.choices.map((choice) => {
                const on = multi
                  ? ((value as string[] | undefined) ?? []).includes(
                      choice.value,
                    )
                  : value === choice.value;
                return (
                  <label
                    key={choice.value}
                    className={`t-option${on ? " t-on-option" : ""}`}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={question.id}
                      checked={on}
                      onChange={() => pick(question.id, choice.value, multi)}
                    />
                    <span className="t-cursor" aria-hidden>
                      ❯
                    </span>
                    <span className="t-mark" aria-hidden>
                      {multi ? (on ? "[x]" : "[ ]") : on ? "(•)" : "( )"}
                    </span>
                    <span>
                      {choice.label}
                      {"hint" in choice && choice.hint && (
                        <span className="t-dim"> — {choice.hint}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <p className="t-line t-dim t-keys">
        ↑↓ move · space or enter picks · ↓ past the last goes to save
      </p>
      <Result result={result} />
      <Actions
        id="profile"
        autoFocus={false}
        handle={actions}
        actions={[
          { label: "save", kind: "primary", run: save },
          ...(only
            ? [
                {
                  label: "all questions",
                  run: () => router.push("/settings/profile"),
                },
              ]
            : []),
        ]}
      />
    </SettingsFrame>
  );
}
