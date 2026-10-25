/**
 * Coarse facts about where practice runs, recorded with `practice.opened` so behaviour can be
 * compared across comparable groups: browser and OS family, the primary pointer, language, time
 * zone, what a few physical keys type, and whether automation drives the browser. Never a
 * user-agent string or anything that could single out a device.
 */
import type { Environment } from "../../../packages/domain/practice";

/** Keys whose characters tell QWERTY, QWERTZ, AZERTY and Nordic layouts apart. */
const LAYOUT_KEYS = ["KeyQ", "KeyW", "KeyY", "KeyZ", "KeyM", "Semicolon", "Quote", "BracketLeft"];

function browserOf(ua: string): string {
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Mac OS X|Macintosh/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux/.test(ua)) return "linux";
  return "other";
}

async function layoutOf(): Promise<Environment["layout"]> {
  const keyboard = (
    navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
    }
  ).keyboard;
  try {
    const map = await keyboard?.getLayoutMap?.();
    if (!map) return null;
    return Object.fromEntries(LAYOUT_KEYS.flatMap((code) => (map.has(code) ? [[code, map.get(code)!]] : [])));
  } catch {
    return null;
  }
}

export async function environmentOf(): Promise<Environment> {
  const ua = navigator.userAgent;
  return {
    browser: browserOf(ua),
    os: osOf(ua),
    pointer: matchMedia("(pointer: fine)").matches
      ? "fine"
      : matchMedia("(pointer: coarse)").matches
        ? "coarse"
        : "none",
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    layout: await layoutOf(),
    automated: navigator.webdriver === true,
  };
}
