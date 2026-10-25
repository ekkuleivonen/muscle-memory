"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../../lib/chat";

/** Lines seen per issue and attempt, on this device: only what makes the unread dot. */
const SEEN_KEY = "muscle-memory.chat-seen";

function readSeen(scope: string): number {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return typeof all[scope] === "number" ? all[scope] : 0;
  } catch {
    return 0;
  }
}

function writeSeen(scope: string, count: number) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...all, [scope]: count }));
  } catch {
    // Without storage the dot just shows again next time.
  }
}

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * The team chat, a small overlay on every page of the incident: the people around the work.
 * It never opens by itself and never takes the focus; new lines only light a dot. Nothing in
 * it is required, and there is nothing to reply to. Escape or Close returns the focus to where
 * it was, so an editor keeps its cursor.
 */
export function TeamChat({
  messages,
  scope,
  channel = "#incident",
  inIde = false,
}: {
  messages: readonly ChatMessage[];
  /** Issue and attempt the unread count belongs to. */
  scope: string;
  channel?: string;
  /** In the IDE the toggle sits above the status bar. */
  inIde?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const returnTo = useRef<HTMLElement | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => setSeen(readSeen(scope)), [scope]);
  // While open, whatever arrives counts as seen, and the list follows the newest line.
  useEffect(() => {
    if (!open) return;
    writeSeen(scope, messages.length);
    setSeen(messages.length);
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [open, messages.length, scope]);

  const show = () => {
    // A pointer press already noted where the focus was; a key press leaves it on the toggle.
    returnTo.current ??= document.activeElement as HTMLElement | null;
    setOpen(true);
    // The person asked for it, so the panel may take the focus now.
    requestAnimationFrame(() => heading.current?.focus());
  };
  const hide = () => {
    setOpen(false);
    const back = returnTo.current;
    returnTo.current = null;
    requestAnimationFrame(() =>
      (back && document.contains(back) ? back : toggle.current)?.focus(),
    );
  };
  const unread = Math.max(0, messages.length - seen);
  if (!messages.length) return null;
  return (
    <div className={inIde ? "team-chat in-ide" : "team-chat"}>
      {open && (
        <section
          className="team-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="team-chat-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              hide();
            }
          }}
        >
          <header>
            <h2 id="team-chat-title" ref={heading} tabIndex={-1}>
              {channel}
            </h2>
            <span className="faint">Kettlebrook team</span>
            <button
              type="button"
              className="team-chat-close"
              aria-label="Close the chat"
              onClick={hide}
            >
              ×
            </button>
          </header>
          <ol ref={list} aria-live="polite">
            {messages.map((m) => (
              <li key={m.id}>
                <p className="team-chat-meta">
                  <b>{m.author}</b> <span className="faint">{m.role}</span>{" "}
                  <time dateTime={m.at} className="faint">
                    {clock(m.at)}
                  </time>
                </p>
                <p>{m.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <button
        type="button"
        ref={toggle}
        className="team-chat-toggle"
        aria-expanded={open}
        // Before the button takes the focus: where to give it back (an editor keeps its cursor).
        onPointerDown={() => {
          if (!open)
            returnTo.current = document.activeElement as HTMLElement | null;
        }}
        aria-label={
          open
            ? `Close ${channel}`
            : unread
              ? `${channel}, ${unread} new ${unread === 1 ? "message" : "messages"}`
              : channel
        }
        onClick={() => (open ? hide() : show())}
      >
        <span aria-hidden>💬</span> {channel}
        {!open && unread > 0 && <span className="team-chat-dot" aria-hidden />}
      </button>
    </div>
  );
}
