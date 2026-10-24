import type { Catalog, ContentRef } from "../../../../packages/catalog/catalog";
import { findEntry } from "../../../../packages/catalog/gates";
import { RUNNABLE } from "../../lib/library";
import type { Executable } from "./workspace";

/** Opened when the URL names no Challenge, e.g. old links to /workspace. */
export const DEFAULT_CHALLENGE = "frequency-map@2.1.0";

/** Resolves `?challenge=id@version` to a published Challenge this browser can run. */
export function selectChallenge(
  catalog: Catalog,
  param: string | null,
):
  | { ok: true; ref: ContentRef; challenge: Executable }
  | { ok: false; message: string } {
  const match = /^([a-z0-9][a-z0-9-]*)@(\d+\.\d+\.\d+)$/.exec(
    param ?? DEFAULT_CHALLENGE,
  );
  if (!match)
    return {
      ok: false,
      message: "Challenges are named like frequency-map@2.1.0.",
    };
  const ref = { kind: "challenge", id: match[1], version: match[2] } as const;
  const entry = findEntry(catalog, ref);
  if (entry?.state !== "published")
    return { ok: false, message: `${param} is not a published challenge.` };
  const content = entry.content as Executable & { language?: string };
  if (
    !RUNNABLE.some((id) => id === content.language) ||
    typeof content.entrypoint !== "string" ||
    typeof content.starter !== "string"
  )
    return {
      ok: false,
      message: `${content.id}@${content.version} can't run in the browser yet.`,
    };
  return { ok: true, ref, challenge: content };
}
