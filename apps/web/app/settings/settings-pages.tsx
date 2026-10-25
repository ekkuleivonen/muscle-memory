"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  deleteAccount,
  ensureHandle,
  logOut,
  readProfile,
  resetProgress,
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
import { logProfile } from "../(browse)/_components/board-log";
import type { CommandName } from "./commands";

/**
 * Settings commands as pages read and clicked, in the terminal's look: what the command does,
 * where things stand, buttons, and one line saying what happened. Profile has its own form.
 */
export function SettingsCommand({
  command,
}: {
  command: Exclude<CommandName, "profile">;
}) {
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

/** The page's frame: title, then the command; a way back at the end. */
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
      <p className="t-back">
        <Link href="/settings" className="t-cmd">
          ← settings
        </Link>
      </p>
    </main>
  );
}

/** Commands need an account on this device; read after mount, like all browser storage. */
export function Account({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"reading" | "none" | "ok">("reading");
  useEffect(() => setState(ensureHandle() ? "ok" : "none"), []);
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

function Button({
  children,
  onClick,
  kind = "plain",
  disabled = false,
}: {
  children: ReactNode;
  onClick(): void;
  kind?: "primary" | "plain" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`t-btn${kind === "plain" ? "" : ` t-btn-${kind}`}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
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
        : "Done, you've gone stealth. We won't include you in our stats or comparisons from now on, including what you've already done, and you won't see other people's stats either.",
    });
  };
  return (
    <SettingsFrame title="Privacy">
      <p>
        What you do here is recorded to run the product: keeping your practice
        history and making better issues. Community comparisons require
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
      <div className="t-actions">
        {stealth ? (
          <Button kind="primary" onClick={() => choose(true)}>
            share my anonymised data
          </Button>
        ) : (
          <Button onClick={() => choose(false)}>go stealth</Button>
        )}
      </div>
      <Result result={result} />
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
      const name = backupName(ensureHandle(), new Date());
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
        (answers, board, every recorded keystroke and run), to keep safe or to
        import in another browser.
      </p>
      <p className="t-dim">
        It also holds this browser&apos;s secret key, the one that can delete
        what was uploaded. Keep the file private.
      </p>
      <div className="t-actions">
        <Button kind="primary" disabled={busy} onClick={() => void download()}>
          {busy ? "preparing…" : "download backup"}
        </Button>
      </div>
      <Result result={result} />
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
    window.location.assign("/dashboard");
  };
  return (
    <SettingsFrame title="Import">
      <p>
        Importing a backup replaces everything in this browser with what the
        file holds: you carry on where it left off.
      </p>
      {!picked ? (
        <div className="t-actions">
          <Button kind="primary" onClick={() => void choose()}>
            choose backup file
          </Button>
        </div>
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
          <div className="t-actions">
            <Button
              kind="danger"
              disabled={busy}
              onClick={() => void replace()}
            >
              replace everything in this browser
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setPicked(null);
                setResult({ tone: "dim", text: "Nothing changed." });
              }}
            >
              cancel
            </Button>
          </div>
        </>
      )}
      <Result result={result} />
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
      <div className="t-actions">
        <Button
          kind="primary"
          onClick={() => {
            logOut();
            router.push("/");
          }}
        >
          log out
        </Button>
      </div>
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
    setResult({ tone: "ok", text: "Done. Fresh board." });
  };
  return (
    <SettingsFrame title="Reset">
      <p>
        This empties your board and deletes saved practice and recorded activity
        from this browser. Your settings stay. Anything already uploaded stays
        with us until you delete your account.
      </p>
      <div className="t-actions">
        {!asking ? (
          <Button
            kind="danger"
            onClick={() => {
              setResult(null);
              setAsking(true);
            }}
          >
            reset all progress
          </Button>
        ) : (
          <>
            <span className="t-ask">Sure? This can&apos;t be undone.</span>
            <Button kind="danger" disabled={busy} onClick={() => void reset()}>
              yes, reset
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setAsking(false);
                setResult({ tone: "dim", text: "Nothing changed." });
              }}
            >
              cancel
            </Button>
          </>
        )}
      </div>
      <Result result={result} />
    </SettingsFrame>
  );
}

const DELETE_WORD = "delete";

function Delete() {
  const router = useRouter();
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
        This deletes your profile, board, saved practice and activity from this
        browser and from our servers, and signs you out.{" "}
        <span className="t-err">It can&apos;t be undone.</span> Published
        anonymised datasets aren&apos;t linked to you, so they stay.
      </p>
      <label className="t-field">
        <span>
          Type <strong>{DELETE_WORD}</strong> to confirm
        </span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="t-actions">
        <Button
          kind="danger"
          disabled={busy || typed.trim() !== DELETE_WORD}
          onClick={() => void remove()}
        >
          delete everything
        </Button>
      </div>
      <Result result={result} />
    </SettingsFrame>
  );
}
