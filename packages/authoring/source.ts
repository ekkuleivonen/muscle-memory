import type { ChallengeMetadata, Revision } from "../content/model";
import type { ChallengeSource, Private } from "../content/source";
import { validateCatalog } from "../content/validate";
import { publishProblems } from "../content/publish";
import { revisionId } from "../content/revision";
import { canonical, type Json } from "../domain/json";
import { digest, runtimePin } from "./runtime";
import type { RuntimePin } from "./contracts";

export class AuthoringInvalid extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}
export const MAX_SOURCE_BYTES = 1024 * 1024;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthoringInvalid("Expected an object.");
  return value as Record<string, unknown>;
}
function codes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 24 ||
    !value.every((v) => typeof v === "string" && v.length <= 131072)
  )
    throw new AuthoringInvalid(
      "Code variants must be a bounded array of whole source files.",
    );
  return value;
}
/** Explicit projection prevents an unrecognized private field entering a public snapshot. */
function publicRevision(value: unknown): Revision {
  const r = record(value);
  return {
    challenge: r.challenge,
    task: r.task,
    language: r.language,
    file: r.file,
    starter: r.starter,
    entrypoint: r.entrypoint,
    ...(r.parameters !== undefined ? { parameters: r.parameters } : {}),
    ...(r.schema !== undefined ? { schema: r.schema } : {}),
    ...(r.adapter !== undefined ? { adapter: r.adapter } : {}),
    cases: Array.isArray(r.cases)
      ? r.cases.map((value) => {
          const c = record(value);
          return {
            id: c.id,
            ...(c.name !== undefined ? { name: c.name } : {}),
            input: c.input,
            expected: c.expected,
            hidden: c.hidden,
          };
        })
      : r.cases,
    rules: Array.isArray(r.rules)
      ? r.rules.map((value) => {
          const rule = record(value);
          return {
            id: rule.id,
            message: rule.message,
            when: trigger(rule.when),
          };
        })
      : r.rules,
  } as Revision;
}
function trigger(value: unknown, depth = 0): unknown {
  if (depth > 16) throw new AuthoringInvalid("Rule nesting is too deep.");
  const r = record(value);
  if (Array.isArray(r.all))
    return { all: r.all.map((v) => trigger(v, depth + 1)) };
  if (Array.isArray(r.any))
    return { any: r.any.map((v) => trigger(v, depth + 1)) };
  if (r.not !== undefined) return { not: trigger(r.not, depth + 1) };
  if (r.pattern !== undefined) {
    if (typeof r.pattern !== "string" || r.pattern.length > 512)
      throw new AuthoringInvalid("Rule pattern is too large.");
    return { pattern: r.pattern, present: r.present };
  }
  return { metric: r.metric, above: r.above };
}
function metadata(value: unknown): Omit<ChallengeMetadata, "revision"> {
  const m = record(value);
  return {
    key: m.key,
    title: m.title,
    summary: m.summary,
    difficulty: m.difficulty,
    tags: m.tags,
    ...(m.hook !== undefined ? { hook: m.hook } : {}),
  } as Omit<ChallengeMetadata, "revision">;
}
export function normalizedSource(value: unknown): ChallengeSource {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).length > MAX_SOURCE_BYTES
    )
      throw new AuthoringInvalid("Draft exceeds the 1 MiB limit.");
    const raw = record(value),
      secret = record(raw.private);
    const revision = publicRevision(raw.revision),
      meta = metadata(raw.metadata);
    if (meta.key !== revision.challenge)
      throw new AuthoringInvalid("Draft ID and revision ID must match.");
    if (
      !Array.isArray(revision.cases) ||
      revision.cases.length > 200 ||
      !Array.isArray(revision.rules) ||
      revision.rules.length > 32
    )
      throw new AuthoringInvalid(
        "A draft needs at most 200 cases and 32 rules.",
      );
    if (
      revision.parameters &&
      (!Array.isArray(revision.parameters) ||
        !revision.parameters.every(
          (p) => typeof p === "string" && p.length <= 64,
        ))
    )
      throw new AuthoringInvalid("Parameters must be names.");
    // Validate the JSON tree as well as the current content schema (including finite numbers).
    canonical(revision as unknown as Json);
    const id = revisionId(revision);
    validateCatalog({
      schemaVersion: "1.0.0",
      challenges: [{ ...meta, revision: id }],
      revisions: { [id]: revision },
    });
    if (typeof secret.solution !== "string" || secret.solution.length > 131072)
      throw new AuthoringInvalid(
        "A bounded whole-file reference solution is required.",
      );
    const examples: Record<string, { fires: string[]; quiet: string[] }> =
      Object.create(null);
    for (const [key, entry] of Object.entries(record(secret.examples ?? {}))) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(key))
        throw new AuthoringInvalid("Rule example ID is invalid.");
      const e = record(entry);
      examples[key] = { fires: codes(e.fires), quiet: codes(e.quiet) };
    }
    const privatePart: Private = {
      solution: secret.solution,
      alternatives: codes(secret.alternatives),
      wrong: codes(secret.wrong),
      examples,
    };
    if (privatePart.alternatives.length + privatePart.wrong.length > 24)
      throw new AuthoringInvalid("Too many code variants.");
    return { metadata: meta, revision, private: privatePart };
  } catch (error) {
    if (error instanceof AuthoringInvalid) throw error;
    throw new AuthoringInvalid(
      error instanceof Error ? error.message : "Invalid draft source.",
    );
  }
}
/** Structural saving is separate from the stronger publish gate, so drafts can be unfinished. */
export function structuralProblems(source: ChallengeSource): string[] {
  const revision = source.revision;
  const problems = publishProblems(revision, source.private);
  if (revision.language === "sql" && !revision.schema?.trim())
    problems.push("SQL needs its schema.");
  if (
    ["c", "cpp", "java"].includes(revision.language) &&
    !revision.adapter?.trim()
  )
    problems.push("This language needs its JSON adapter.");
  return problems;
}
export async function prepareSource(
  value: unknown,
  existing?: {
    metadata: ChallengeMetadata;
    revision: Revision;
    runtime: string;
  },
): Promise<{
  source: ChallengeSource;
  runtime: RuntimePin;
  revision: string;
  draftDigest: string;
}> {
  const source = normalizedSource(value);
  const runtime = await runtimePin(source.revision.language);
  const oldRevision = existing ? publicRevision(existing.revision) : undefined;
  // An unchanged legacy snapshot restores exactly its old hash; new/changed snapshots
  // include the publication pin. Private-code edits invalidate QA, not public history.
  const unchanged =
    existing &&
    existing.runtime === runtime.fingerprint &&
    canonical(source.metadata as unknown as Json) ===
      canonical(metadata(existing.metadata) as unknown as Json) &&
    canonical(source.revision as unknown as Json) ===
      canonical(oldRevision as unknown as Json);
  const revision = unchanged
    ? existing.revision
    : {
        ...source.revision,
        publication: { metadata: source.metadata, runtime },
      };
  const prepared = { ...source, revision };
  return {
    source: prepared,
    runtime,
    revision: revisionId(revision),
    draftDigest: await digest(prepared),
  };
}
