"use client";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  ACCOUNT_CHANGE,
  ensureHandle,
  parseStoredProfile,
} from "../../../lib/account";
import { CONSENT_COOKIE, PROFILE_KEY } from "../../../lib/profile";
import { TerminalIcon } from "./icons";

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
    if (!ensureHandle()) {
      document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      window.location.replace(
        `/consent?next=${encodeURIComponent(location.pathname + location.search)}`,
      );
    }
  }, []);
  return parseStoredProfile(raw);
}

/**
 * Bottom of the sidebar: one way into settings, the terminal, where everything about the
 * account lives (answers, stealth, backups, log out, reset, delete). Reading the
 * account here also sends anyone whose profile is gone back to /consent, on every page.
 */
export function SettingsLink() {
  useAccount();
  return (
    <Link className="side-link" href="/settings">
      <TerminalIcon /> Settings
    </Link>
  );
}
