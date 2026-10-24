/**
 * URL query state for the issue and category lists. Unknown values are dropped rather than
 * rejected, so hand-edited or stale links still show a sensible list.
 */
import type {
  Difficulty,
  IssueKind,
} from "../../../packages/domain/assessment";
import { LANGUAGES, type LanguageId } from "./languages";
import {
  DIFFICULTIES,
  KINDS,
  languageLabel,
  type Category,
  type Issue,
} from "./library";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface IssueQuery {
  q: string;
  language: LanguageId[];
  kind: IssueKind[];
  difficulty: Difficulty[];
  category: string[];
}

export interface CategoryQuery {
  q: string;
  language: LanguageId[];
}

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

function all(params: SearchParams, key: string): string[] {
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function allowed<T extends string>(
  params: SearchParams,
  key: string,
  values: readonly T[],
): T[] {
  // Kept in the canonical order of `values`, without duplicates.
  const given = new Set(all(params, key));
  return values.filter((v) => given.has(v));
}

function text(params: SearchParams): string {
  return (all(params, "q")[0] ?? "").trim().slice(0, 100);
}

export function parseIssueQuery(params: SearchParams): IssueQuery {
  return {
    q: text(params),
    language: allowed(params, "language", LANGUAGE_IDS),
    kind: allowed(params, "kind", KINDS),
    difficulty: allowed(params, "difficulty", DIFFICULTIES),
    // Category slugs are checked against the catalog when filtering.
    category: [...new Set(all(params, "category"))].slice(0, 20),
  };
}

export function parseCategoryQuery(params: SearchParams): CategoryQuery {
  return {
    q: text(params),
    language: allowed(params, "language", LANGUAGE_IDS),
  };
}

function matchesText(fields: readonly string[], q: string): boolean {
  const haystack = fields.join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function issueText(issue: Issue): string[] {
  return [
    issue.slug,
    issue.title,
    issue.summary ?? "",
    issue.task,
    issue.kind ?? "",
    issue.difficulty ?? "",
    issue.language ?? "",
    languageLabel(issue.language),
    ...issue.labels,
    ...issue.categories.map((c) => c.title),
  ];
}

/** Every filter group must match (any value within a group); every search term must appear. */
export function filterIssues(
  issues: readonly Issue[],
  query: IssueQuery,
): Issue[] {
  const within = <T>(selected: readonly T[], value: T | undefined) =>
    selected.length === 0 || (value !== undefined && selected.includes(value));
  return issues
    .filter(
      (issue) =>
        within(query.language, issue.language) &&
        within(query.kind, issue.kind) &&
        within(query.difficulty, issue.difficulty) &&
        (query.category.length === 0 ||
          issue.categories.some((c) => query.category.includes(c.slug))) &&
        matchesText(issueText(issue), query.q),
    )
    .sort(
      (a, b) =>
        rank(a.difficulty) - rank(b.difficulty) ||
        a.title.localeCompare(b.title),
    );
}

const rank = (d: Difficulty | undefined) =>
  d ? DIFFICULTIES.indexOf(d) : DIFFICULTIES.length;

export function filterCategories(
  categories: readonly Category[],
  query: CategoryQuery,
): Category[] {
  return categories.filter(
    (category) =>
      (query.language.length === 0 ||
        category.issues.some(
          (i) => i.language && query.language.includes(i.language),
        )) &&
      matchesText(
        [
          category.slug,
          category.title,
          category.summary ?? "",
          category.story,
          ...category.issues.flatMap(issueText),
        ],
        query.q,
      ),
  );
}

/** A query string for links; repeated keys for multi-value filters, empty values omitted. */
export function toSearch(query: IssueQuery | CategoryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    for (const v of Array.isArray(value) ? value : [value])
      if (v) params.append(key, v);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** The same query with one value of a multi-value filter switched on or off. */
export function toggle<Q extends IssueQuery | CategoryQuery>(
  query: Q,
  key: Exclude<keyof Q, "q">,
  value: string,
): Q {
  const current = query[key] as unknown as string[];
  return {
    ...query,
    [key]: current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value],
  };
}
