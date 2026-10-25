/**
 * The challenge search: one `q` string with qualifiers such as
 * `lang:python,go difficulty:easy tag:maps is:starred`, plus free text. Commas mean "any of";
 * different qualifiers must all match. Unknown qualifiers and values are kept as plain text
 * rather than rejected, so hand-typed queries still work.
 */
import type { Difficulty } from "../../../packages/content/model";
import { LANGUAGES, type LanguageId } from "./languages";
import { DIFFICULTIES, languageLabel, type Issue } from "./library";

export const SORTS = ["key", "difficulty", "title"] as const;
export type Sort = (typeof SORTS)[number];
/** What a person has marked or done, as search terms: is:starred, is:completed. */
export const MARKS = ["starred", "completed"] as const;
export type Mark = (typeof MARKS)[number];
export interface IssueQuery {
  language: LanguageId[];
  difficulty: Difficulty[];
  tag: string[];
  /** Marks live in the browser, so the server leaves this filter to the client. */
  marks: Mark[];
  sort: Sort;
  text: string[];
}

export type ListKey = "language" | "difficulty" | "tag" | "marks";

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);
/** Qualifier names people type, mapped to the filter they set. */
const QUALIFIERS: Record<string, ListKey> = {
  lang: "language",
  language: "language",
  difficulty: "difficulty",
  diff: "difficulty",
  tag: "tag",
};
const ALLOWED: Partial<Record<ListKey, readonly string[]>> = {
  language: LANGUAGE_IDS,
  difficulty: DIFFICULTIES,
};
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MAX_QUERY = 200;

export const emptyIssueQuery = (): IssueQuery => ({
  language: [],
  difficulty: [],
  tag: [],
  marks: [],
  sort: "key",
  text: [],
});

/** Words and "quoted phrases". */
function tokens(q: string): string[] {
  return q.slice(0, MAX_QUERY).match(/"[^"]*"|\S+/g) ?? [];
}

function add<T extends string>(list: T[], value: T) {
  if (!list.includes(value)) list.push(value);
}

export function parseIssueQuery(q: string): IssueQuery {
  const query = emptyIssueQuery();
  for (const token of tokens(q)) {
    const match = /^([a-z]+):(.+)$/i.exec(token);
    const name = match?.[1].toLowerCase();
    if (name === "is") {
      // is:starred, is:completed; anything else (is:runnable, anything unknown) is dropped.
      for (const raw of match![2].toLowerCase().split(",")) {
        const value = raw.trim();
        if (MARKS.includes(value as Mark)) add(query.marks, value as Mark);
      }
      continue;
    }
    if (name === "sort" && SORTS.includes(match![2] as Sort)) {
      query.sort = match![2] as Sort;
      continue;
    }
    const key = name ? QUALIFIERS[name] : undefined;
    if (!key) {
      query.text.push(token.replace(/^"|"$/g, ""));
      continue;
    }
    for (const raw of match![2].toLowerCase().split(",")) {
      const value = raw.trim();
      const allowed = ALLOWED[key];
      if (allowed ? allowed.includes(value) : SLUG.test(value))
        add((query as unknown as Record<string, string[]>)[key], value);
    }
  }
  query.text = query.text.filter(Boolean);
  query.marks = MARKS.filter((m) => query.marks.includes(m));
  return query;
}

/** The canonical query string: qualifiers first, in a fixed order, then free text. */
export function formatQuery(query: IssueQuery): string {
  const parts: string[] = [];
  if (query.marks.length) parts.push(`is:${query.marks.join(",")}`);
  const lists: [string, readonly string[]][] = [
    ["lang", query.language],
    ["difficulty", query.difficulty],
    ["tag", query.tag],
  ];
  for (const [name, values] of lists)
    if (values.length) parts.push(`${name}:${values.join(",")}`);
  if (query.sort !== "key") parts.push(`sort:${query.sort}`);
  parts.push(...query.text.map((t) => (/\s/.test(t) ? `"${t}"` : t)));
  return parts.join(" ");
}

/** The same query with one filter value switched on or off. */
export function toggle(
  query: IssueQuery,
  key: ListKey,
  value: string,
): IssueQuery {
  const current = (query as unknown as Record<ListKey, string[]>)[key];
  return {
    ...query,
    [key]: current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value],
  };
}

function matchesText(fields: readonly string[], terms: readonly string[]) {
  const haystack = fields.join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term.toLowerCase()));
}

function issueText(issue: Issue): string[] {
  return [
    issue.key,
    issue.title,
    issue.summary ?? "",
    issue.task,
    issue.difficulty ?? "",
    issue.language ?? "",
    languageLabel(issue.language),
    ...issue.tags,
  ];
}

const rank = (d: Difficulty | undefined) =>
  d ? DIFFICULTIES.indexOf(d) : DIFFICULTIES.length;

/** Natural order for keys, so NS-10 follows NS-9. */
const byKey = (a: Issue, b: Issue) =>
  a.key.localeCompare(b.key, "en", { numeric: true });

const SORTERS: Record<Sort, (a: Issue, b: Issue) => number> = {
  key: byKey,
  difficulty: (a, b) => rank(a.difficulty) - rank(b.difficulty) || byKey(a, b),
  title: (a, b) => a.title.localeCompare(b.title) || byKey(a, b),
};

/** The marks part of a query, applied where marks are known (the browser): all must hold. */
export function filterByMarks<T extends { key: string }>(
  issues: readonly T[],
  marks: readonly Mark[],
  has: (key: string, mark: Mark) => boolean,
): T[] {
  return issues.filter((issue) => marks.every((mark) => has(issue.key, mark)));
}

/** Every filter except marks must match (any value within one); every text term must appear. */
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
        within(query.difficulty, issue.difficulty) &&
        (query.tag.length === 0 ||
          issue.tags.some((t) => query.tag.includes(t))) &&
        matchesText(issueText(issue), query.text),
    )
    .sort(SORTERS[query.sort]);
}
