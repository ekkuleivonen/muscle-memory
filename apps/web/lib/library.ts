/**
 * Read model for browsing published content as an issue tracker: Challenges are issues,
 * Adventures are projects. Pure, so pages, search and filters are testable without a server.
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

/** Story points shown as an estimate, in the 1-2-3-5 scale trackers use. */
export const ESTIMATES: Record<Difficulty, number> = {
  "warm-up": 1,
  easy: 2,
  medium: 3,
  hard: 5,
};
/** Number of distinct project colours the theme defines (--hue-0 …). */
export const HUES = 8;

export interface ProjectRef {
  slug: string;
  title: string;
  key: string;
  /** Index into the theme's project colours, by catalog position. */
  hue: number;
}

export interface Issue {
  slug: string;
  /** Permanent identifier such as NS-2: project key and issue number. */
  key: string;
  version: string;
  title: string;
  summary?: string;
  task: string;
  kind?: IssueKind;
  difficulty?: Difficulty;
  estimate?: number;
  language?: LanguageId;
  labels: readonly string[];
  criteria: { input: Json; expected: Json }[];
  hints: number;
  comments: readonly IssueComment[];
  runnable: boolean;
  /** The project whose latest version includes this issue; content allows only one. */
  project?: ProjectRef;
}

export interface Project extends ProjectRef {
  version: string;
  summary?: string;
  story: string;
  /** Exactly the issue versions this project pins, in its order. */
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

/** "night-shift" → "NS"; a single word keeps its first three letters. */
export function keyFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  return (
    words.length > 1
      ? words
          .slice(0, 3)
          .map((w) => w[0])
          .join("")
      : slug.slice(0, 3)
  ).toUpperCase();
}

function toIssue(
  content: Executable,
  project: ProjectRef | undefined,
  key: string,
): Issue {
  const language = LANGUAGES.find((l) => l.id === content.language)?.id;
  return {
    slug: content.id,
    key,
    version: content.version,
    title: content.title ?? titleFromSlug(content.id),
    summary: content.summary,
    task: content.task,
    kind: content.kind,
    difficulty: content.difficulty,
    estimate: content.difficulty && ESTIMATES[content.difficulty],
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
    project,
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
  /** The latest published version of every project. */
  projects: Project[];
  /** A specific published version, e.g. one a project pins. */
  issueVersion(slug: string, version: string): Issue | undefined;
  /** The latest issue for a key (any case) or, for older links, a slug. */
  findIssue(ref: string): Issue | undefined;
}

/** Canonical issue URL: the key decides, the slug is for people. */
export function issueHref(
  issue: Pick<Issue, "key" | "slug" | "version">,
  latestVersion?: string,
): string {
  const path = `/issues/${issue.key}/${issue.slug}`;
  return latestVersion && latestVersion !== issue.version
    ? `${path}?version=${issue.version}`
    : path;
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
  const refs = adventures.map(
    (a, i): ProjectRef => ({
      slug: a.id,
      title: a.title ?? titleFromSlug(a.id),
      key: a.key ?? keyFromSlug(a.id),
      // Spread by position so neighbouring projects never share a colour.
      hue: (i * 3) % HUES,
    }),
  );
  const ownerOf = (slug: string) =>
    adventures.findIndex((a) => a.challenges.some(([id]) => id === slug));
  const projectOf = (slug: string): ProjectRef | undefined =>
    refs[ownerOf(slug)];
  const keyOf = (slug: string): string => {
    const i = ownerOf(slug);
    if (i < 0) return keyFromSlug(slug);
    // Numbers are permanent across versions; unnumbered legacy content falls back to order.
    const number =
      challenges.find((c) => c.id === slug && c.number !== undefined)?.number ??
      adventures[i].challenges.findIndex(([id]) => id === slug) + 1;
    return `${refs[i].key}-${number}`;
  };
  const issueVersion = (slug: string, version: string) => {
    const content = challenges.find(
      (c) => c.id === slug && c.version === version,
    );
    return content && toIssue(content, projectOf(slug), keyOf(slug));
  };
  const issues = [...latestBy(challenges).values()].map((c) =>
    toIssue(c, projectOf(c.id), keyOf(c.id)),
  );
  return {
    issues,
    projects: adventures.map((adventure, i) => ({
      ...refs[i],
      version: adventure.version,
      summary: adventure.summary,
      story: adventure.story,
      // A pinned Challenge can be disabled after the Adventure was published; leave it out
      // rather than list something that cannot start.
      issues: adventure.challenges.flatMap(
        ([id, version]) => issueVersion(id, version) ?? [],
      ),
    })),
    issueVersion,
    findIssue: (ref) =>
      issues.find((i) => i.key === ref.toUpperCase()) ??
      issues.find((i) => i.slug === ref),
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
