"use client";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { privateView } from "../../../../packages/developer-profile/private-view";
import {
  historyWindow,
  type UploadedHistory,
} from "../../../../packages/developer-profile/uploaded-history";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import { listenPrivateBoundary } from "../../lib/private-boundary";
import { ACCOUNT_CHANGE, readProfile } from "../../lib/account";
import { acceptsCurrent } from "../../lib/legal";
import { PROFILE_KEY } from "../../lib/profile";
import { PROGRESS_CHANGE, PROGRESS_KEY } from "../../lib/progress";

/** Explicit, mounted-view-only history. Never writes progress, settings, backups or summaries. */
export function UploadedHistoryControl({
  onChange,
}: {
  onChange: (history: UploadedHistory | null) => void;
}) {
  const abort = useRef<AbortController | null>(null),
    generation = useRef(0);
  const [view] = useState(() => privateView<UploadedHistory>());
  const state = useSyncExternalStore(
    view.subscribe,
    view.getSnapshot,
    view.getSnapshot,
  );
  const [dates] = useState(() => {
    const to = new Date().toISOString().slice(0, 10);
    return {
      to,
      from: new Date(Date.parse(to) - 55 * 86400000).toISOString().slice(0, 10),
    };
  });
  const [from, setFrom] = useState(dates.from),
    [to, setTo] = useState(dates.to);
  const [message, setMessage] = useState("");
  const clear = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    view.invalidate();
    onChange(null);
    setMessage("");
  }, [view, onChange]);
  useEffect(() => {
    view.invalidate();
    const boundary = () => flushSync(clear);
    const storage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === PROFILE_KEY ||
        event.key === PROGRESS_KEY
      )
        boundary();
    };
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start")
        flushSync(() => {
          generation.current++;
          abort.current?.abort();
          view.invalidate(true);
          onChange(null);
          setMessage("");
        });
      else view.release();
    });
    window.addEventListener(ACCOUNT_CHANGE, boundary);
    window.addEventListener(PROGRESS_CHANGE, boundary);
    window.addEventListener("storage", storage);
    return () => {
      stop();
      generation.current++;
      abort.current?.abort();
      view.invalidate();
      window.removeEventListener(ACCOUNT_CHANGE, boundary);
      window.removeEventListener(PROGRESS_CHANGE, boundary);
      window.removeEventListener("storage", storage);
    };
  }, [view, clear, onChange]);
  useEffect(() => onChange(state.value), [state.value, onChange]);
  const load = async (more = false) => {
    let account;
    try {
      account = readProfile();
    } catch {
      clear();
      return;
    }
    if (!account || account.signedOut || !acceptsCurrent(account.accepted)) {
      clear();
      return;
    }
    const previous = more ? state.value : null;
    if (!more) clear();
    const ticket = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const note = (message: string) => {
      if (ticket === generation.current) setMessage(message);
    };
    await view.read(async () => {
      const window = historyWindow({ from, to, after: previous?.next ?? "" });
      const store = await openPracticeStore();
      let identity;
      try {
        identity = await store.existingIdentity();
      } finally {
        store.close();
      }
      if (!identity) {
        note(
          "No uploaded ownership secret is available on this browser. This can happen before the first upload or when uploads are disabled. Use device evidence or import your own private backup; a participant ID alone cannot recover history.",
        );
        throw new Error("No identity.");
      }
      const response = await fetch("/api/private-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...identity, window }),
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      if (!response.ok) {
        const error =
          response.status === 429
            ? "Wait a minute before loading another history page."
            : [401, 403, 410].includes(response.status)
              ? "Uploaded history is no longer authorized. Your previous uploaded view was cleared."
              : "Uploaded history is unavailable or not configured yet. Device evidence remains available.";
        // Ownership rejection is a destructive boundary even if an older page was present.
        if (
          [401, 403, 410].includes(response.status) &&
          ticket === generation.current
        ) {
          flushSync(() => {
            view.invalidate();
            onChange(null);
          });
        }
        note(error);
        throw new Error(error);
      }
      const next = (await response.json()) as UploadedHistory;
      const merged = new Map(
        [...(previous?.attempts ?? []), ...next.attempts].map((a) => [
          `${a.attempt}:${a.revision}`,
          a,
        ]),
      );
      const unavailable = new Map(
        [...(previous?.unavailable ?? []), ...(next.unavailable ?? [])].map(
          (a) => [a.attempt, a],
        ),
      );
      if (merged.size + unavailable.size > 100)
        throw new Error(
          "Choose a narrower date window; this view is limited to 100 attempt revisions.",
        );
      note("");
      return {
        ...next,
        attempts: [...merged.values()],
        unavailable: [...unavailable.values()],
      };
    });
  };
  return (
    <details aria-label="Private uploaded history" className="stats-section">
      <summary>Uploaded history / optional</summary>
      <p>
        Read code-free summaries of your existing uploads using this browser’s
        private ownership secret. Nothing is added to local history or restored
        into device progress. Reset clears this view; loading it again is your
        choice.
      </p>
      <p className="t-dim">
        Choose attempts with activity in these UTC dates (up to 366 days); each
        selected attempt is read in full. Uploads can lag by minutes or be
        incomplete. Five attempts per page; up to 100 attempt revisions in this
        view. Each page reads the current snapshot; late uploads or deletion can
        change earlier pages. Reload from the start for a fresh view. This is
        not a complete account export.
      </p>
      <div className="stats-controls">
        <label>
          From{" "}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              clear();
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          Through{" "}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              clear();
              setTo(e.target.value);
            }}
          />
        </label>
        <button
          className="t-cmd"
          disabled={state.loading}
          onClick={() => void load()}
        >
          Load uploaded history
        </button>
        {state.value?.next && (
          <button
            className="t-cmd"
            disabled={
              state.loading ||
              state.value.attempts.length + state.value.unavailable.length >=
                100
            }
            onClick={() => void load(true)}
          >
            Load next page
          </button>
        )}
        {state.value && (
          <button className="t-cmd" onClick={clear}>
            Return to device evidence
          </button>
        )}
      </div>
      {state.value?.unavailable.map((a) => (
        <p className="stats-warning" key={a.attempt}>
          Uploaded attempt last observed {a.last}: {a.reason}
        </p>
      ))}
      <p role="status">
        {state.loading
          ? "Reading private uploaded summaries…"
          : message ||
            (state.error
              ? "History could not be read. Check dates and try again. The view limit is 100 attempt revisions."
              : state.value?.state === "absent"
                ? "No current uploaded ownership record exists for this browser. No SQL history was read."
                : state.value
                  ? `${state.value.attempts.length} uploaded attempt revisions loaded; ${state.value.unavailable.length} over-budget attempts unavailable; read ${state.value.readAt}. ${state.value.next ? "More pages remain." : "No further attempts in this window at query time."}`
                  : "Uploaded history has not been loaded.")}
        {state.error && state.value ? " Previous uploaded view is stale." : ""}
      </p>
    </details>
  );
}
