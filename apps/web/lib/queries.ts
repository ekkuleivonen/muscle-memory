/**
 * The challenge search: one `q` string with qualifiers such as
 * `kind:bug lang:python,go difficulty:easy label:maps is:todo`, plus free text. Commas mean "any of"; different qualifiers must all match. Unknown qualifiers
 * and values are kept as plain text rather than rejected, so hand-typed queries still work.
 */
import type {
  Difficulty,
  IssueKind,
} from "../../../packages/content/model";
import type { Status } from "./board";
import { LANGUAGES, type LanguageId } from "./languages";
import { DIFFICULTIES, KINDS, languageLabel, type Issue } from "./library";

export const SORTS = ["key", "difficulty", "title"] as const;
export type Sort = (typeof SORTS)[number];
/** Board statuses as search terms: is:todo, is:backlog,done. */
export const STATUSES: readonly Status[] = [
  "backlog",
  "todo",
  "in-progress",
  "done",
];
export interface IssueQuery {
  language: LanguageId[];
  kind: IssueKind[];
  difficulty: Difficulty[];
  label: string[];
  /** Board status lives in the browser, so the server leaves this filter to the client. */
  status: Status[];
  sort: Sort;
  text: string[];
}

export type ListKey = "language" | "kind" | "difficulty" | "label" | "status";

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);
/** Qualifier names people type, mapped to the filter they set. */
const QUALIFIERS: Record<string, ListKey> = {
  lang: "language",
  language: "language",
  kind: "kind",
  type: "kind",
  difficulty: "difficulty",
  diff: "difficulty",
  label: "label",
};
const ALLOWED: Partial<Record<ListKey, readonly string[]>> = {
  language: LANGUAGE_IDS,
  kind: KINDS,
  difficulty: DIFFICULTIES,
};
const SLUG = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MAX_QUERY = 200;

export const emptyIssueQuery = (): IssueQuery => ({
  language: [],
  kind: [],
  difficulty: [],
  label: [],
  status: [],
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
      // Board statuses as is:todo or is:backlog,done. (is:runnable from older links is
      // ignored: every issue runs now.)
      for (const raw of match![2].toLowerCase().split(",")) {
        const value = raw.trim();
        if (STATUSES.includes(value as Status))
          add(query.status, value as Status);
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
  query.status = STATUSES.filter((st) => query.status.includes(st));
  return query;
}

/** The canonical query string: qualifiers first, in a fixed order, then free text. */
export function formatQuery(query: IssueQuery): string {
  const parts: string[] = [];
  if (query.status.length)
    parts.push(
      `is:${STATUSES.filter((s) => query.status.includes(s)).join(",")}`,
    );
  const lists: [string, readonly string[]][] = [
    ["kind", query.kind],
    ["lang", query.language],
    ["difficulty", query.difficulty],
    ["label", query.label],
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
    issue.slug,
    issue.title,
    issue.summary ?? "",
    issue.task,
    issue.kind ?? "",
    issue.difficulty ?? "",
    issue.language ?? "",
    languageLabel(issue.language),
    ...issue.labels,
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

/** The board-status part of a query, applied where the board is known (the browser). */
export function filterByStatus<T extends { key: string }>(
  issues: readonly T[],
  statuses: readonly Status[],
  statusOf: (key: string) => Status,
): T[] {
  return statuses.length
    ? issues.filter((issue) => statuses.includes(statusOf(issue.key)))
    : [...issues];
}

/** Every filter except board status must match (any value within one); every text term must appear. */
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
        (query.label.length === 0 ||
          issue.labels.some((l) => query.label.includes(l))) &&
        matchesText(issueText(issue), query.text),
    )
    .sort(SORTERS[query.sort]);
}
