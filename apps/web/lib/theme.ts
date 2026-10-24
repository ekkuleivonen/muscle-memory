/**
 * Light, dark, or whatever the OS says. Kept in this browser and applied as `data-theme` on
 * <html> before the first paint (THEME_SCRIPT in the root layout), so the CSS can follow the
 * choice and fall back to the OS when there is none.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "muscle-memory.theme";

export function readTheme(): Theme {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Runs inline in <head>, before anything paints: the same as applyTheme(readTheme()). */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
