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
  // Cards from the retired incident carry its version; there is no such page to show any more.
  if (result?.iv !== undefined) return { kind: "older", key: null };
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
}

/** A fragment longer than this is refused when sharing: too long for many chats and posts. */
export const MAX_CODE_FRAGMENT = 24_000;
const MAX_FILES = 8;
const MAX_TEXT = 64_000;
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

/** The files, compressed, as a fragment value; null when they would not fit in a link. */
export async function encodeCode(files: readonly SharedFile[]): Promise<string | null> {
  const clean = files.filter((f) => PATH.test(f.path)).slice(0, MAX_FILES);
  if (!clean.length || clean.reduce((n, f) => n + f.text.length, 0) > MAX_TEXT) return null;
  const json = JSON.stringify({ v: 1, f: clean.map((f) => [f.path, f.text]) });
  const packed = base64url(
    await through(new TextEncoder().encode(json), new CompressionStream("deflate-raw")),
  );
  return packed.length > MAX_CODE_FRAGMENT ? null : packed;
}

/** Files from a fragment value, or null when it is not something `encodeCode` made. */
export async function decodeCode(value: string): Promise<SharedFile[] | null> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_CODE_FRAGMENT) return null;
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    // JSON escapes can at most double the text; anything larger was not made here.
    const json = await through(bytes, new DecompressionStream("deflate-raw"), MAX_TEXT * 2 + 1024);
    const parsed = JSON.parse(new TextDecoder().decode(json));
    if (parsed?.v !== 1 || !Array.isArray(parsed.f) || !parsed.f.length || parsed.f.length > MAX_FILES)
      return null;
    const files: SharedFile[] = [];
    let total = 0;
    for (const entry of parsed.f) {
      if (!Array.isArray(entry) || entry.length !== 2) return null;
      const [path, text] = entry;
      if (typeof path !== "string" || !PATH.test(path) || typeof text !== "string") return null;
      total += text.length;
      files.push({ path, text });
    }
    return total > MAX_TEXT ? null : files;
  } catch {
    return null;
  }
}

/** The `#code=` part of a result link, or "" without code. */
export const codeFragment = (packed: string | null) => (packed ? `#code=${packed}` : "");

/** The fragment value from `location.hash`, if it has one. */
export function codeFromHash(hash: string): string | null {
  const match = /^#code=([A-Za-z0-9_-]+)$/.exec(hash);
  return match ? match[1] : null;
}
