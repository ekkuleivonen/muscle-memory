"use client";
import { isPracticePath } from "../../../lib/paths";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const CURRENT_PATH_KEY = "muscle-memory.current-path";
import {
  challengeContext,
  logPage,
  logView,
  PREVIOUS_PATH_KEY,
} from "../../../lib/site-log";

/**
 * Records every page of the app as it is shown, with its query (searches and filters are GET
 * forms and links, so they arrive as queries) and the page before it, and outside the IDE the
 * page becoming visible, hidden, focused or resized. The IDE records its own page state.
 * Nothing is recorded without the current Terms accepted (see lib/site-log.ts).
 */
export function TrackerActivity() {
  const path = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const here = query ? `${path}?${query}` : path;
    // Development runs effects twice; the same page right after itself is that, not a view.
    if (last.current === here) return;
    // The page before this one: in this page load, or the last one shown in this tab.
    let previous = last.current;
    try {
      previous ??= sessionStorage.getItem(CURRENT_PATH_KEY);
      sessionStorage.setItem(CURRENT_PATH_KEY, here);
      if (previous) sessionStorage.setItem(PREVIOUS_PATH_KEY, previous);
      else sessionStorage.removeItem(PREVIOUS_PATH_KEY);
    } catch {
      // Storage can be unavailable; the IDE then falls back to document.referrer.
    }
    last.current = here;
    void logView(challengeContext(path), { path, query, previous });
  }, [path, query]);

  const inIde = isPracticePath(path);
  useEffect(() => {
    if (inIde) return;
    let resize: ReturnType<typeof setTimeout> | undefined;
    const page = () =>
      void logPage({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
    const resized = () => {
      clearTimeout(resize);
      resize = setTimeout(page, 250);
    };
    document.addEventListener("visibilitychange", page);
    window.addEventListener("focus", page);
    window.addEventListener("blur", page);
    window.addEventListener("resize", resized);
    return () => {
      clearTimeout(resize);
      document.removeEventListener("visibilitychange", page);
      window.removeEventListener("focus", page);
      window.removeEventListener("blur", page);
      window.removeEventListener("resize", resized);
    };
  }, [inIde]);
  return null;
}
