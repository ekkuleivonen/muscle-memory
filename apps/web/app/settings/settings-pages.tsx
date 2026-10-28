"use client";
import Link from "next/link";
import { useComparisonPrivacy } from "../../lib/use-comparison-privacy";
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
  ACCOUNT_CHANGE,
  deleteAccount,
  logOut,
  readProfile,
  requestUploadedCopy,
  resetProgress,
  saveProfile,
  setStealth,
} from "../../lib/account";
import { guesses, PROFILE_KEY, type StoredProfile } from "../../lib/profile";
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

/** Where a profile form was opened from, to return there after save or cancel. */
export const RETURNS = {
  stats: { label: "back to your report", href: "/stats#q-languages" },
  /** From a comparison note on the report: the optional age answer comparisons need. */
  "stats-comparisons": { label: "back to your report", href: "/stats" },
} as const;
type ReturnTo = (typeof RETURNS)[keyof typeof RETURNS];

/**
 * Settings commands as pages in the terminal's look: what the command does, where things
 * stand, one line saying what happened, then the actions as a prompt's choices, run by key or
 * click (KeyActions), ending with the way back. Profile has its own form.
 */
export function SettingsCommand({
  command,
  question,
  from,
}: {
  command: CommandName;
  /** Profile only: ask just this question (/settings/profile/languages). */
  question?: string;
  /** Profile only: the page that opened the form. */
  from?: keyof typeof RETURNS;
}) {
  if (command === "profile")
    return (
      <Account>
        <ProfileForm only={question} from={from && RETURNS[from]} />
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
  access: Access,
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
  to = { label: "back to settings", href: "/settings" },
}: {
  id: string;
  message?: string;
  actions: readonly KeyAction[];
  autoFocus?: boolean;
  handle?: Ref<{ focus(index?: number): void }>;
  /** Where back (and Esc) goes. */
  to?: { label: string; href: string };
}) {
  const router = useRouter();
  const back = () => router.push(to.href);
  return (
    <KeyActions
      ref={handle}
      id={id}
      message={message}
      autoFocus={autoFocus}
      actions={[...actions, { label: to.label, run: back }]}
      onEscape={back}
    />
  );
}

const describe = (p?: { stealth: boolean; age: string } | null) =>
  p
    ? `${p.stealth ? "stealth" : "not stealth"}, ${p.age === "adult" ? "adult" : p.age === "non-adult" ? "under 18" : "age unanswered"}`
    : "nothing recorded";

/**
 * Where human comparisons stand for this browser on the server, which is what decides whether it
 * is counted. Nothing here writes on its own: saving, going stealth or the explicit action does.
 */
function ComparisonPrivacyStatus() {
  const { view, retry, applyReviewed } = useComparisonPrivacy();
  // Only an adult outside stealth has anything to add; the server not knowing already excludes others.
  const countable = view.local?.age === "adult" && !view.local.stealth;
  return (
    <div role="status" aria-live="polite">
      <p className="t-dim">
        {view.status === "disabled"
          ? "Human comparisons are off. Server exclusion has not been confirmed."
          : view.status === "confirmed"
            ? "The server confirmed these comparison privacy settings. Results already authorized may still arrive; downloaded aggregates cannot be recalled."
            : view.status === "unshared"
              ? countable
                ? "Not shared yet: the server has no comparison settings for this browser, so it isn't counted in comparisons. Saving an age answer or a stealth choice sends them, and so does the action below; opening this page doesn't."
                : "The server has no comparison settings for this browser, so it isn't counted in comparisons."
              : view.status === "conflict"
                ? "Your current settings differ from the server. Review them before applying; another tab may have changed them."
                : view.status === "deleted"
                  ? "The server marked this browser for deletion. Keep its deletion key until the request is confirmed."
                  : "Settings apply on this device now. Server confirmation is pending: it needs a connection, and a browser is only known to the server once its first practice has uploaded. Retry after that."}
      </p>
      {view.status === "conflict" && (
        <p className="t-dim">
          Server: {describe(view.remote)}. This device: {describe(view.local)}.
        </p>
      )}
      {(view.status === "conflict" ||
        (view.status === "unshared" && countable)) && (
        <button className="t-cmd" onClick={() => void applyReviewed()}>
          {view.status === "unshared"
            ? "use these settings for comparisons"
            : "apply these reviewed settings"}
        </button>
      )}
      {(view.status === "pending" || view.status === "conflict") && (
        <button className="t-cmd" onClick={() => void retry()}>
          {view.status === "conflict"
            ? "check server settings again"
            : "retry these settings"}
        </button>
      )}
    </div>
  );
}

function Privacy() {
  const [stored, setStored] = useState<StoredProfile | null>(null);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  useEffect(() => {
    const update = () => setStored(readProfile());
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key === PROFILE_KEY) update();
    };
    update();
    window.addEventListener(ACCOUNT_CHANGE, update);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGE, update);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const stealth = stored?.stealth === true;
  const choose = (share: boolean) => {
    setStealth(!share);
    void logProfile("settings");
    setStored(readProfile());
    setResult({
      tone: "dim",
      text: share
        ? "Saved on this device. Adult eligibility and server confirmation are required before future human comparisons."
        : "Stealth is on for this device and your report is hidden. Server exclusion is separate; check its confirmation below. Recording and uploads continue.",
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
        Your runs may count towards future published insights (statistics and
        findings, never your records or code) and community comparisons. Go
        stealth to be excluded from both; in return your report on /stats is off
        too. Recording and uploads continue in stealth.
      </p>
      <p className="t-state">
        Right now you&apos;re{" "}
        <strong>
          {stealth ? "in stealth on this device" : "not stealth on this device"}
        </strong>
        .
      </p>
      <Result result={result} />
      <ComparisonPrivacyStatus />
      <Actions
        id="privacy"
        actions={[
          stealth
            ? {
                label: "count me in again",
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
        (answers, progress, stars and the practice this browser keeps), to keep
        safe or to import in another browser.
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

function Access() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  const ask = async () => {
    setBusy(true);
    try {
      const reference = await requestUploadedCopy();
      setResult(
        reference
          ? {
              tone: "ok",
              text: (
                <>
                  Requested. Your reference is <strong>{reference}</strong>.
                  Email it to{" "}
                  <a
                    className="t-cmd"
                    href={`mailto:support@rowandreason.com?subject=${encodeURIComponent(`Data request ${reference}`)}`}
                  >
                    support@rowandreason.com
                  </a>{" "}
                  and we&apos;ll reply within a month with a copy of your
                  records.
                </>
              ),
            }
          : {
              tone: "dim",
              text: "Our servers hold nothing from this browser, so there's nothing to request. Export has everything this browser keeps.",
            },
      );
    } catch (cause) {
      setResult({
        tone: "err",
        text:
          cause instanceof Error
            ? cause.message
            : "Nothing was requested. Try again later.",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsFrame title="Access">
      <p>
        Ask for a copy of everything our servers hold from this browser: the
        records it uploaded, with when each arrived and the country it came
        from. This browser proves the records are yours; you get a reference to
        email us, and we reply with the copy as a file.
      </p>
      <p className="t-dim">
        What this browser keeps is already yours to download with export. The
        request doesn&apos;t send us your email; emailing us does.
      </p>
      <Result result={result} />
      <Actions
        id="access"
        actions={[
          {
            label: "request my data",
            kind: "primary",
            disabled: busy && "requesting…",
            run: () => void ask(),
          },
        ]}
      />
    </SettingsFrame>
  );
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
        This clears your progress and deletes saved practice and recorded
        activity from this browser. Your settings stay. Anything already
        uploaded stays with us until you delete your account, and your report
        can still read it.
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
        This deletes your profile, progress, stars, saved practice and activity
        from this browser and from our servers, and signs you out.{" "}
        <span className="t-err">It can&apos;t be undone.</span> Published
        insights aren&apos;t about you, so they stay.
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
 * stores only questions explicitly changed. Unchanged guesses stay guesses until confirmed;
 * cleared answers become unanswered after saving.
 */
function ProfileForm({ only, from }: { only?: string; from?: ReturnTo }) {
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null);
  /** Questions with a value the person didn't give (quick start's language). */
  const [guessed, setGuessed] = useState<Set<keyof Profile>>(new Set());
  const [changed, setChanged] = useState<Set<keyof Profile>>(new Set());
  const options = useRef<HTMLDivElement>(null);
  const actions = useRef<{ focus(index?: number): void }>(null);
  const router = useRouter();
  const [result, setResult] = useState<{ tone: Tone; text: ReactNode } | null>(
    null,
  );
  useEffect(() => {
    const stored = readProfile();
    setAnswers({ ...stored?.profile } as Record<string, Answer>);
    setGuessed(guesses(stored));
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
    // Esc anywhere in the questions leaves without saving, as it does from the actions.
    if (event.key === "Escape") {
      event.preventDefault();
      return router.push(from?.href ?? "/settings");
    }
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
    setChanged((current) => new Set(current).add(id as keyof Profile));
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
      if (!changed.has(question.id) || question.kind !== "multiselect")
        continue;
      const list = (next[question.id] as string[] | undefined) ?? [];
      // No selections means an explicit cleared answer, not a validation error.
      if (!list.length) delete next[question.id];
      else if (list.length < question.min) {
        setResult({
          tone: "err",
          text: `Pick at least ${question.min}: ${question.message}`,
        });
        return;
      }
    }
    if (!changed.size) {
      setResult({
        tone: "dim",
        text: shown.some((q) => guessed.has(q.id))
          ? "Nothing changed. A guess stays a guess until you confirm or change it."
          : "Nothing changed.",
      });
      return;
    }
    let stored: StoredProfile | null;
    try {
      stored = saveProfile(toProfile(next), [...changed]);
    } catch {
      setResult({
        tone: "err",
        text: "This browser couldn't save your answers. Storage may be blocked or full; nothing was changed.",
      });
      return;
    }
    if (!stored) return;
    void logProfile("settings");
    setAnswers({ ...stored.profile } as Record<string, Answer>);
    setGuessed(guesses(stored));
    setChanged(new Set());
    setResult({
      tone: "ok",
      text: from ? (
        <>
          Saved.{" "}
          <Link className="t-cmd" href={from.href}>
            {from.label}
          </Link>
        </>
      ) : (
        "Saved."
      ),
    });
  };
  const mark = (id: keyof Profile) => {
    setResult(null);
    setChanged((current) => new Set(current).add(id));
  };
  return (
    <SettingsFrame title={only ? "Profile question" : "Profile"}>
      <p className="t-dim">
        {only === "languages"
          ? "Optional. Your answer groups your own practice on your report into your usual languages and others: change it, then save."
          : "Every question is optional. Your answers let us compare groups (never people): change any of them, then save."}
      </p>
      {shown.some((question) => question.id === "age") && (
        <ComparisonPrivacyStatus />
      )}
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
              {guessed.has(question.id) && !changed.has(question.id) && (
                <p className="t-dim">
                  Ticked from quick start, as a guess. It isn&apos;t your
                  answer until you confirm or change it, then save.{" "}
                  <button
                    type="button"
                    className="t-cmd"
                    onClick={() => {
                      mark(question.id);
                      setResult({
                        tone: "dim",
                        text: "Confirmed. Save to keep it as your answer.",
                      });
                      // The button goes away; Save (the first action) is the next step, wherever the cursor was.
                      actions.current?.focus(0);
                    }}
                  >
                    Confirm as my answer
                  </button>
                </p>
              )}
              <button
                type="button"
                className="t-cmd"
                disabled={value === undefined}
                onClick={() => {
                  mark(question.id);
                  setAnswers((current) => {
                    const next = { ...current };
                    delete next[question.id];
                    return next;
                  });
                }}
              >
                Clear answer
              </button>
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
        to={from}
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
