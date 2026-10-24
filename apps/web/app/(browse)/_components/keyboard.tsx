"use client";
import { useEffect } from "react";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Tracker shortcuts: `/` focuses search, `j`/`k` move between issue rows (Enter opens),
 * Escape closes menus. Menus also close when clicking elsewhere.
 */
export function Keyboard() {
  useEffect(() => {
    function closeMenus(except?: Element | null) {
      document
        .querySelectorAll<HTMLDetailsElement>("details.menu[open]")
        .forEach((menu) => menu !== except && (menu.open = false));
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenus();
        if (typing(event.target)) (event.target as HTMLElement).blur();
        return;
      }
      if (
        typing(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-search]")?.focus();
      } else if (event.key === "j" || event.key === "k") {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-row]")];
        if (!rows.length) return;
        const index = rows.indexOf(document.activeElement as HTMLElement);
        const next =
          index < 0
            ? 0
            : Math.max(
                0,
                Math.min(rows.length - 1, index + (event.key === "j" ? 1 : -1)),
              );
        rows[next].focus();
        rows[next].scrollIntoView({ block: "nearest" });
        event.preventDefault();
      }
    }
    function onClick(event: MouseEvent) {
      closeMenus((event.target as Element).closest("details.menu"));
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
