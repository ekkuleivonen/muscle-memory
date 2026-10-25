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

/** Why code could not go into a link. Never a partial snapshot: all of it, or none. */
export type CodeRefusal =
  | "empty"
  | "too-many-files"
  | "invalid-path"
  | "incomplete"
  | "missing"
  | "too-large";

/** What the person is told when their code can't be included. */
export const REFUSALS: Record<CodeRefusal, string> = {
  empty: "There is no code to include.",
  "too-many-files": `You changed more than ${MAX_FILES} files, too many to fit in a link.`,
  "invalid-path": "Your file has a name that can't go in a link.",
  incomplete: "Your code wasn't saved in full, so it can't be shared exactly.",
  "too-large": "Your code is too long to fit in a link.",
  missing:
    "The code that was checked wasn't kept, so it can't be shared exactly. Your current code is never shared in its place.",
};

/** Files a link may carry, or why not: the same rules for sharing and for reading. */
function check(files: readonly SharedFile[]): CodeRefusal | null {
  if (!files.length) return "empty";
  if (files.length > MAX_FILES) return "too-many-files";
  if (
    files.some(
      (f) =>
        typeof f.path !== "string" ||
        !PATH.test(f.path) ||
        typeof f.text !== "string",
    )
  )
    return "invalid-path";
  if (files.some((f) => f.truncated)) return "incomplete";
  if (files.reduce((n, f) => n + f.text.length, 0) > MAX_TEXT)
    return "too-large";
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
  const packed = base64url(
    await through(json, new CompressionStream("deflate-raw")),
  );
  if (packed.length > MAX_CODE_FRAGMENT)
    return { ok: false, reason: "too-large" };
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
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_CODE_FRAGMENT)
      return null;
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = await through(
      bytes,
      new DecompressionStream("deflate-raw"),
      MAX_JSON_BYTES,
    );
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(json),
    );
    if (parsed?.v !== 1 || !Array.isArray(parsed.f)) return null;
    if (!parsed.f.every((e: unknown) => Array.isArray(e) && e.length === 2))
      return null;
    const files: SharedFile[] = parsed.f.map(
      ([path, text]: [string, string]) => ({ path, text }),
    );
    return check(files) ? null : files;
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
 * The solution a completion checked, as a link may carry it: every editable file of the code
 * artifact the completing run used (for a single-file challenge, the one file). A file kept
 * only in part is marked truncated, so sharing it is refused rather than cut. Null when the
 * run or its artifact isn't in the records: then there is nothing exact to offer.
 */
export function solutionOf(
  records: readonly { kind: string; recordId: string; payload: string }[],
  runId: string,
  editable: readonly string[],
): SharedFile[] | null {
  let artifactId: string | null = null;
  for (const record of records) {
    if (record.kind !== "observation") continue;
    try {
      const o = JSON.parse(record.payload);
      if (
        o.type === "practice.run" &&
        o.data?.runId === runId &&
        typeof o.data.codeArtifactId === "string"
      )
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
    const files = artifact?.files ?? {};
    if (!editable.length || editable.some((p) => !files[p])) return null;
    return [...editable].sort().map((path) => ({
      path,
      text: typeof files[path].text === "string" ? files[path].text : "",
      truncated:
        artifact.truncated === true ||
        files[path].capture?.truncated === true ||
        typeof files[path].text !== "string",
    }));
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
        cta: `Try ${key} yourself →`,
      }
    : {
        lede: "Start from the current challenge’s code in your own attempt: nothing of theirs comes with it.",
        cta: `Try the current version of ${key} →`,
      };
}
