/**
 * Shared links: an issue (`/try/RG-4`), a merged pull request's result (`/r/<card>`), and the
 * code someone chose to include with a result (`#code=…`, after the card).
 *
 * A link carries only what is in it. An issue link is the issue's permanent key, so it opens
 * the same problem for anyone and never the sender's editor, attempt or records. A result link
 * is the allowlisted card (`publicResult`). Code travels only when the sharer ticks the box,
 * and then in the URL fragment, which browsers never send to the server: nothing stores it.
 */
import { decodeResult, type Result } from "./result";

/** The public page of an issue: what it is, and a fresh start on it. */
export const tryHref = (key: string) => `/try/${key}`;

/** What a result link turned out to be, so a bad or old one gets an honest page. */
export type CardLink =
  | { readonly kind: "result"; readonly result: Result }
  /** It decodes, but from a card version we no longer show; the issue it names, if any. */
  | { readonly kind: "older"; readonly key: string | null }
  | { readonly kind: "malformed" };

const KEY = /^[A-Z][A-Z0-9]{1,4}-[1-9]\d{0,3}$/;

/** Reads a result link's path segment. Never invents a result for one that does not decode. */
export function inspectCard(segment: string): CardLink {
  const result = decodeResult(segment);
  // Cards from the retired incident carry its version; that page is gone, but its issue may not be.
  if (result?.iv !== undefined) return { kind: "older", key: result.k };
  if (result) return { kind: "result", result };
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    if (value && typeof value === "object" && typeof value.v === "number" && value.v !== 2)
      return {
        kind: "older",
        key: typeof value.k === "string" && KEY.test(value.k) ? value.k : null,
      };
  } catch {
    // Not base64url JSON at all.
  }
  return { kind: "malformed" };
}

/** One file as shared: its path in the repo and the text pushed. */
export interface SharedFile {
  readonly path: string;
  readonly text: string;
  /** Set by the sender when only part of the file was kept: such code is never shared. */
  readonly truncated?: boolean;
}

/** A fragment longer than this is refused when sharing: too long for many chats and posts. */
export const MAX_CODE_FRAGMENT = 24_000;
export const MAX_FILES = 8;
const MAX_TEXT = 64_000;
/** The inflated JSON, in UTF-8 bytes: the one size budget both sharing and reading enforce. */
export const MAX_JSON_BYTES = MAX_TEXT * 2 + 1024;
const PATH = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/;

const base64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function through(bytes: Uint8Array, stream: GenericTransformStream, limit = Infinity) {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // Stop inflating early: a small link must not expand into something huge.
    if (size > limit) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Why code could not go into a link. Never a partial snapshot: all of it, or none. */
export type CodeRefusal = "empty" | "too-many-files" | "invalid-path" | "incomplete" | "too-large";

/** What the person is told when their code can't be included. */
export const REFUSALS: Record<CodeRefusal, string> = {
  empty: "There are no changed files to include.",
  "too-many-files": `This pull request changed more than ${MAX_FILES} files, too many to fit in a link.`,
  "invalid-path": "A changed file has a name that can't go in a link.",
  incomplete: "A changed file wasn't saved in full, so your code can't be shared exactly.",
  "too-large": "Your code is too long to fit in a link.",
};

/** Files a link may carry, or why not: the same rules for sharing and for reading. */
function check(files: readonly SharedFile[]): CodeRefusal | null {
  if (!files.length) return "empty";
  if (files.length > MAX_FILES) return "too-many-files";
  if (files.some((f) => typeof f.path !== "string" || !PATH.test(f.path) || typeof f.text !== "string"))
    return "invalid-path";
  if (files.some((f) => f.truncated)) return "incomplete";
  if (files.reduce((n, f) => n + f.text.length, 0) > MAX_TEXT) return "too-large";
  return null;
}

/**
 * The files, compressed, as a fragment value; or why they can't be shared. Every file is
 * included or none is, and only a value that reads back as exactly these files is returned.
 */
export async function encodeCode(
  files: readonly SharedFile[],
): Promise<{ ok: true; packed: string } | { ok: false; reason: CodeRefusal }> {
  const refused = check(files);
  if (refused) return { ok: false, reason: refused };
  const json = new TextEncoder().encode(
    JSON.stringify({ v: 1, f: files.map((f) => [f.path, f.text]) }),
  );
  if (json.length > MAX_JSON_BYTES) return { ok: false, reason: "too-large" };
  const packed = base64url(await through(json, new CompressionStream("deflate-raw")));
  if (packed.length > MAX_CODE_FRAGMENT) return { ok: false, reason: "too-large" };
  // What the recipient will read, checked here: if the two sides ever disagree on a rule,
  // no link is made rather than one that does not open.
  const back = await decodeCode(packed);
  const same =
    back?.length === files.length &&
    back.every((f, i) => f.path === files[i].path && f.text === files[i].text);
  return same ? { ok: true, packed } : { ok: false, reason: "too-large" };
}

/** Files from a fragment value, or null when it is not something `encodeCode` made. */
export async function decodeCode(value: string): Promise<SharedFile[] | null> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_CODE_FRAGMENT) return null;
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = await through(bytes, new DecompressionStream("deflate-raw"), MAX_JSON_BYTES);
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
    if (parsed?.v !== 1 || !Array.isArray(parsed.f)) return null;
    if (!parsed.f.every((e: unknown) => Array.isArray(e) && e.length === 2)) return null;
    const files: SharedFile[] = parsed.f.map(([path, text]: [string, string]) => ({ path, text }));
    return check(files) ? null : files;
  } catch {
    return null;
  }
}

/** The `#code=` part of a result link, or "" without code. */
export const codeFragment = (packed?: string | null) => (packed ? `#code=${packed}` : "");

/** The fragment value from `location.hash`, if it has one. */
export function codeFromHash(hash: string): string | null {
  const match = /^#code=([A-Za-z0-9_-]+)$/.exec(hash);
  return match ? match[1] : null;
}
