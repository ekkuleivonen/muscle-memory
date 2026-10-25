/**
 * Reads challenges as they are written: one folder per challenge under content/challenges,
 * named by its key (docs/challenges.md). Authoring and checks only (node:fs); the app reads
 * the built catalog.
 *
 *   PY-001/
 *     challenge.json   title, summary, hook?, difficulty, tags, file, entrypoint, parameters?
 *     task.md          what to do
 *     <file>           the starter, under the file's own name (count_words.py)
 *     cases.json       [{ name?, input, expected, hidden? }]
 *     rules.json       optional: [{ id, message, when }]
 *     schema.sql       SQL: the tables each case's rows go into
 *     adapter.<ext>    C, C++ and Java: JSON arguments to the function's types
 *     private/         never published: solution, alternative-N, wrong-N, rules/<id>/fires-N, quiet-N
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { Json } from "../domain/json";
import { KEY, KEY_CODES } from "./keys";
import type { ChallengeMetadata, Difficulty, Revision, Rule } from "./model";

/** What a challenge's private folder holds: whole files, never published. */
export interface Private {
  /** A correct solution: it must pass every case and fire no rule. */
  readonly solution: string;
  /** Other correct designs: each must pass every case and fire no rule. */
  readonly alternatives: readonly string[];
  /** Plausible mistakes: each must fail at least one case. */
  readonly wrong: readonly string[];
  /** Per rule: code that must fire it, and code that must not. */
  readonly examples: Readonly<Record<string, { fires: readonly string[]; quiet: readonly string[] }>>;
}

export interface ChallengeSource {
  readonly metadata: Omit<ChallengeMetadata, "revision">;
  readonly revision: Revision;
  readonly private: Private;
}

const LANGUAGE_OF = Object.fromEntries(Object.entries(KEY_CODES).map(([language, code]) => [code, language]));

const read = (dir: string, name: string) => readFileSync(join(dir, name), "utf8");
const json = (dir: string, name: string) => JSON.parse(read(dir, name));
/** name-1.ext, name-2.ext, … in order. */
function numbered(dir: string, name: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => new RegExp(`^${name}-\\d+\\.`).test(f))
    .sort((a, b) => Number(/-(\d+)\./.exec(a)![1]) - Number(/-(\d+)\./.exec(b)![1]))
    .map((f) => read(dir, f));
}

export function readChallenge(dir: string): ChallengeSource {
  const key = basename(dir);
  const code = KEY.exec(key)?.[1];
  const language = code && LANGUAGE_OF[code];
  if (!language) throw new Error(`${key}: a challenge's folder is its key, such as PY-003.`);
  const meta = json(dir, "challenge.json") as {
    title: string;
    summary: string;
    hook?: string;
    difficulty: Difficulty;
    tags: string[];
    file: string;
    entrypoint: string;
    parameters?: string[];
  };
  const cases = (json(dir, "cases.json") as { name?: string; input: Json; expected: Json; hidden?: boolean }[]).map(
    (c, i) => ({
      id: `case-${i + 1}`,
      ...(c.name ? { name: c.name } : {}),
      input: c.input,
      expected: c.expected,
      hidden: c.hidden === true,
    }),
  );
  const rules: Rule[] = existsSync(join(dir, "rules.json")) ? json(dir, "rules.json") : [];
  const optional = (name: string) => (existsSync(join(dir, name)) ? read(dir, name) : undefined);
  const adapterFile = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith("adapter.")) : undefined;
  const schema = optional("schema.sql");
  const adapter = adapterFile ? read(dir, adapterFile) : undefined;
  const revision: Revision = {
    challenge: key,
    task: read(dir, "task.md"),
    language,
    file: meta.file,
    starter: read(dir, basename(meta.file)),
    entrypoint: meta.entrypoint,
    ...(meta.parameters ? { parameters: meta.parameters } : {}),
    ...(schema ? { schema } : {}),
    ...(adapter ? { adapter } : {}),
    cases,
    rules,
  };
  const privateDir = join(dir, "private");
  const ext = extname(meta.file);
  const rulesDir = join(privateDir, "rules");
  const examples = Object.fromEntries(
    (existsSync(rulesDir) ? readdirSync(rulesDir) : []).map((id) => [
      id,
      { fires: numbered(join(rulesDir, id), "fires"), quiet: numbered(join(rulesDir, id), "quiet") },
    ]),
  );
  return {
    metadata: {
      key,
      title: meta.title,
      summary: meta.summary,
      ...(meta.hook ? { hook: meta.hook } : {}),
      difficulty: meta.difficulty,
      tags: meta.tags,
    },
    revision,
    private: {
      solution: read(privateDir, `solution${ext}`),
      alternatives: numbered(privateDir, "alternative"),
      wrong: numbered(privateDir, "wrong"),
      examples,
    },
  };
}

/** Every challenge under `root` (content/challenges), by key. */
export function readChallenges(root: string): ChallengeSource[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readChallenge(join(root, d.name)))
    .sort((a, b) => a.metadata.key.localeCompare(b.metadata.key, "en", { numeric: true }));
}
