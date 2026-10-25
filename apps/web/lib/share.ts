/**
 * Shared links: a challenge (`/challenges/RG-4`), a completed challenge's result (`/r/<card>`), and
 * the solution someone chose to include with a result (`#code=…`, after the card).
 *
 * A link carries only what is in it. A challenge link is its permanent key, so it opens the
 * same problem for anyone and never the sender's editor, attempt or records. A result link is
 * the allowlisted card (`publicOutcome`). Code travels only when the sharer ticks the box, and
 * then in the URL fragment, which browsers never send to the server: nothing stores it. A
 * challenge has one file to edit, so a link normally carries one; the format takes up to
 * `MAX_FILES`, so links made when challenges had several still read back whole.
 */
import { CHALLENGE_KEY } from "../../../packages/domain/records";
import { decodeOutcome, type Outcome } from "./outcome";

/** What a result link turned out to be, so a bad or old one gets an honest page. */
export type CardLink =
  /** A completed challenge (card version 3). */
  | { readonly kind: "outcome"; readonly outcome: Outcome }
  | { readonly kind: "malformed" };

/** Reads a result link's path segment. Never invents a result for one that does not decode. */
export function inspectCard(segment: string): CardLink {
  try {
    const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    );
    if (value && typeof value === "object" && value.v === 3) {
      const outcome = decodeOutcome(segment);
      return outcome ? { kind: "outcome", outcome } : { kind: "malformed" };
    }
  } catch {
    // Not base64url JSON at all.
  }
  return { kind: "malformed" };
}

/** The file as shared: its name and the text checked. */
export interface SharedFile {
  readonly path: string;
  readonly text: string;
  /** Set by the sender when only part of the file was kept: such code is never shared. */
  readonly truncated?: boolean;
}

/** A fragment longer than this is refused when sharing: too long for many chats and posts. */
export const MAX_CODE_FRAGMENT = 24_000;
const MAX_TEXT = 64_000;
/** The inflated JSON, in UTF-8 bytes: the one size budget both sharing and reading enforce. */
export const MAX_JSON_BYTES = MAX_TEXT * 2 + 1024;
const PATH = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/;

const base64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

async function through(
  bytes: Uint8Array,
  stream: GenericTransformStream,
  limit = Infinity,
) {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(stream)
    .getReader();
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

/** Why code could not go into a link. Never a partial copy: all of it, or none. */
export type CodeRefusal = "invalid-path" | "incomplete" | "missing" | "too-large";

/** What the person is told when their code can't be included. */
export const REFUSALS: Record<CodeRefusal, string> = {
  "invalid-path": "Your file has a name that can't go in a link.",
  incomplete: "Your code wasn't saved in full, so it can't be shared exactly.",
  "too-large": "Your code is too long to fit in a link.",
  missing:
    "The code that was checked wasn't kept, so it can't be shared exactly. Your current code is never shared in its place.",
};

/** Whether a link may carry the file, or why not: the same rules for sharing and for reading. */
function check(file: SharedFile): CodeRefusal | null {
  if (typeof file.path !== "string" || !PATH.test(file.path) || typeof file.text !== "string")
    return "invalid-path";
  if (file.truncated) return "incomplete";
  if (file.text.length > MAX_TEXT) return "too-large";
  return null;
}

/**
 * The file, compressed, as a fragment value; or why it can't be shared. Only a value that reads
 * back as exactly this file is returned.
 */
export async function encodeCode(
  file: SharedFile,
): Promise<{ ok: true; packed: string } | { ok: false; reason: CodeRefusal }> {
  const refused = check(file);
  if (refused) return { ok: false, reason: refused };
  const json = new TextEncoder().encode(JSON.stringify({ v: 2, p: file.path, t: file.text }));
  if (json.length > MAX_JSON_BYTES) return { ok: false, reason: "too-large" };
  const packed = base64url(await through(json, new CompressionStream("deflate-raw")));
  if (packed.length > MAX_CODE_FRAGMENT) return { ok: false, reason: "too-large" };
  // What the recipient will read, checked here: if the two sides ever disagree on a rule,
  // no link is made rather than one that does not open.
  const back = await decodeCode(packed);
  return back?.path === file.path && back.text === file.text
    ? { ok: true, packed }
    : { ok: false, reason: "too-large" };
}

/** The file from a fragment value, or null when it is not something `encodeCode` made. */
export async function decodeCode(value: string): Promise<SharedFile | null> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_CODE_FRAGMENT) return null;
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = await through(bytes, new DecompressionStream("deflate-raw"), MAX_JSON_BYTES);
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
    if (parsed?.v !== 2 || typeof parsed.p !== "string" || typeof parsed.t !== "string") return null;
    const file = { path: parsed.p, text: parsed.t };
    return check(file) ? null : file;
  } catch {
    return null;
  }
}

/** The `#code=` part of a result link, or "" without code. */
export const codeFragment = (packed?: string | null) =>
  packed ? `#code=${packed}` : "";

/** The fragment value from `location.hash`, if it has one. */
export function codeFromHash(hash: string): string | null {
  const match = /^#code=([A-Za-z0-9_-]+)$/.exec(hash);
  return match ? match[1] : null;
}

/**
 * The solution a completion checked, as a link may carry it: the file in the code artifact the
 * completing run used. A file kept only in part is marked truncated, so sharing it is refused
 * rather than cut. Null when the run or its artifact isn't in the records: then there is nothing
 * exact to offer.
 */
export function solutionOf(
  records: readonly { kind: string; recordId: string; payload: string }[],
  runId: string,
  path: string,
): SharedFile | null {
  let artifactId: string | null = null;
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (o.type === "practice.run" && o.data?.runId === runId && typeof o.data.codeArtifactId === "string")
        artifactId = o.data.codeArtifactId;
    } catch {
      // Unreadable records say nothing.
    }
  }
  const record = artifactId
    ? records.find((r) => r.kind === "artifact" && r.recordId === artifactId)
    : undefined;
  if (!record) return null;
  try {
    const artifact = JSON.parse(record.payload);
    const file = artifact?.files?.[path];
    if (!file) return null;
    return {
      path,
      text: typeof file.text === "string" ? file.text : "",
      truncated:
        artifact.truncated === true || file.capture?.truncated === true || typeof file.text !== "string",
    };
  } catch {
    return null;
  }
}

/**
 * How a shared outcome invites the visitor in. Practice always serves the challenge's live
 * revision, so "the same starting code they did" is said only when the card names that exact
 * revision; a card checked on an earlier one gets the current challenge, said as such.
 */
export function startCopy(
  key: string,
  sameVersion: boolean,
): { lede: string; cta: string } {
  return sameVersion
    ? {
        lede: "You start from the same starting code they did, in your own attempt: nothing of theirs comes with it.",
        cta: `try ${key} yourself →`,
      }
    : {
        lede: "Start from the current challenge’s code in your own attempt: nothing of theirs comes with it.",
        cta: `try the current version of ${key} →`,
      };
}
