/**
 * Read model for browsing published content as an issue tracker: Challenges are issues,
 * Adventures are categories. Pure, so pages, search and filters are testable without a server.
 */
import type { Catalog } from "../../../packages/catalog/catalog";
import type {
  Adventure,
  Challenge,
  Difficulty,
  IssueComment,
  IssueKind,
  Json,
} from "../../../packages/domain/assessment";
import { LANGUAGES, type LanguageId } from "./languages";

/** Languages with an in-browser runner today. */
export const RUNNABLE: readonly LanguageId[] = ["python"];
export const DIFFICULTIES: readonly Difficulty[] = [
  "warm-up",
  "easy",
  "medium",
  "hard",
];
export const KINDS: readonly IssueKind[] = [
  "feature",
  "bug",
  "performance",
  "refactor",
];

export interface CategoryRef {
  slug: string;
  title: string;
}

export interface Issue {
  slug: string;
  version: string;
  title: string;
  summary?: string;
  task: string;
  kind?: IssueKind;
  difficulty?: Difficulty;
  language?: LanguageId;
  labels: readonly string[];
  criteria: { input: Json; expected: Json }[];
  hints: number;
  comments: readonly IssueComment[];
  runnable: boolean;
  /** Categories whose latest version includes this issue, in catalog order. */
  categories: CategoryRef[];
}

export interface Category {
  slug: string;
  version: string;
  title: string;
  summary?: string;
  story: string;
  /** Exactly the issue versions this category pins, in its order. */
  issues: Issue[];
}

type Executable = Challenge & {
  language?: string;
  entrypoint?: string;
  starter?: string;
};

export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** "frequency-map" → "Frequency map", for content published before titles existed. */
export function titleFromSlug(slug: string): string {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function languageLabel(id: string | undefined): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? "Any language";
}

function toIssue(content: Executable, categories: CategoryRef[]): Issue {
  const language = LANGUAGES.find((l) => l.id === content.language)?.id;
  return {
    slug: content.id,
    version: content.version,
    title: content.title ?? titleFromSlug(content.id),
    summary: content.summary,
    task: content.task,
    kind: content.kind,
    difficulty: content.difficulty,
    language,
    labels: content.skills,
    criteria: content.inputs.map((input, i) => ({
      input,
      expected: content.expected[i],
    })),
    hints: content.hints.length,
    comments: content.comments ?? [],
    runnable:
      !!language &&
      RUNNABLE.includes(language) &&
      typeof content.entrypoint === "string" &&
      typeof content.starter === "string",
    categories,
  };
}

function latestBy<T extends { id: string; version: string }>(
  items: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(item.id);
    if (!current || compareVersions(item.version, current.version) > 0)
      latest.set(item.id, item);
  }
  return latest;
}

export interface Library {
  /** The latest published version of every issue. */
  issues: Issue[];
  /** The latest published version of every category. */
  categories: Category[];
  /** A specific published version, e.g. one a category pins. */
  issueVersion(slug: string, version: string): Issue | undefined;
}

export function library(catalog: Catalog): Library {
  const published = Object.values(catalog.entries).filter(
    (entry) => entry.state === "published",
  );
  const challenges = published
    .filter((e) => e.kind === "challenge")
    .map((e) => e.content as Executable);
  const adventures = [
    ...latestBy(
      published
        .filter((e) => e.kind === "adventure")
        .map((e) => e.content as Adventure),
    ).values(),
  ];
  const categoriesOf = (slug: string): CategoryRef[] =>
    adventures
      .filter((a) => a.challenges.some(([id]) => id === slug))
      .map((a) => ({ slug: a.id, title: a.title ?? titleFromSlug(a.id) }));
  const issueVersion = (slug: string, version: string) => {
    const content = challenges.find(
      (c) => c.id === slug && c.version === version,
    );
    return content && toIssue(content, categoriesOf(slug));
  };
  return {
    issues: [...latestBy(challenges).values()].map((c) =>
      toIssue(c, categoriesOf(c.id)),
    ),
    categories: adventures.map((adventure) => ({
      slug: adventure.id,
      version: adventure.version,
      title: adventure.title ?? titleFromSlug(adventure.id),
      summary: adventure.summary,
      story: adventure.story,
      // A pinned Challenge can be disabled after the Adventure was published; leave it out
      // rather than list something that cannot start.
      issues: adventure.challenges.flatMap(
        ([id, version]) => issueVersion(id, version) ?? [],
      ),
    })),
    issueVersion,
  };
}

export function languagesOf(issues: readonly Issue[]): LanguageId[] {
  return LANGUAGES.map((l) => l.id).filter((id) =>
    issues.some((issue) => issue.language === id),
  );
}

export function difficultyRange(issues: readonly Issue[]): string {
  const levels = issues
    .map((i) => i.difficulty)
    .filter((d): d is Difficulty => !!d)
    .sort((a, b) => DIFFICULTIES.indexOf(a) - DIFFICULTIES.indexOf(b));
  if (!levels.length) return "";
  const [low, high] = [levels[0], levels.at(-1)!];
  return low === high ? low : `${low}–${high}`;
}
