"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ACCOUNT_CHANGE,
  ensureHandle,
  logOut,
  parseStoredProfile,
} from "../../../lib/account";
import { PROFILE_KEY } from "../../../lib/profile";
import { Avatar } from "./bits";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ACCOUNT_CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ACCOUNT_CHANGE, onChange);
  };
}

/** The stored profile on this device, kept in sync across components and tabs. */
export function useAccount() {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(PROFILE_KEY),
    () => null,
  );
  useEffect(() => {
    // Profiles from before handles existed get one now.
    ensureHandle();
  }, []);
  return parseStoredProfile(raw);
}

/** Bottom of the sidebar: who you are, settings and log out. */
export function ProfileMenu() {
  const account = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const handle = account?.handle ?? "Anonymous";

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    const items = [
      ...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      setOpen(false);
      root.current?.querySelector<HTMLElement>(".profile-trigger")?.focus();
    } else if (event.key === "ArrowDown" || event.key === "j")
      items[Math.min(items.length - 1, at + 1)]?.focus();
    else if (event.key === "ArrowUp" || event.key === "k")
      items[Math.max(0, at - 1)]?.focus();
    else return;
    event.preventDefault();
  }

  return (
    <div className="profile-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="side-link profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Avatar name={handle} />
        <span className="handle">{handle}</span>
        <span className="caret" aria-hidden>
          ▴
        </span>
      </button>
      {open && (
        <div className="menu-pop profile-pop" role="menu" aria-label="Account">
          <div className="profile-head">
            <b>{handle}</b>
            <span className="faint">Anonymous handle</span>
          </div>
          <Link
            role="menuitem"
            className="menu-item"
            href="/settings"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            onClick={() => {
              logOut();
              router.push("/");
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
