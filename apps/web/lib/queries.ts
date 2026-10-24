/**
 * GitHub-style search for issues and projects: one `q` string with qualifiers such as
 * `kind:bug lang:python,go difficulty:easy project:night-shift label:maps is:runnable`, plus
 * free text. Commas mean "any of"; different qualifiers must all match. Unknown qualifiers
 * and values are kept as plain text rather than rejected, so hand-typed queries still work.
 */
import type {
  Difficulty,
  IssueKind,
} from "../../../packages/domain/assessment";
import { STATUS_LABELS, type Status } from "./board";
import { LANGUAGES, type LanguageId } from "./languages";
import {
  DIFFICULTIES,
  KINDS,
  languageLabel,
  type Project,
  type Issue,
} from "./library";

export type SearchParams = Record<string, string | string[] | undefined>;

export const SORTS = ["key", "difficulty", "title"] as const;
export type Sort = (typeof SORTS)[number];
/** Board statuses as search terms: is:todo, is:backlog,done. */
export const STATUSES: readonly Status[] = [
  "backlog",
  "todo",
  "in-progress",
  "done",
];
export const GROUPS = [
  "project",
  "status",
  "kind",
  "difficulty",
  "language",
  "none",
] as const;
export type Group = (typeof GROUPS)[number];

export interface IssueQuery {
  language: LanguageId[];
  kind: IssueKind[];
  difficulty: Difficulty[];
  project: string[];
  label: string[];
  /** Board status lives in the browser, so the server leaves this filter to the client. */
  status: Status[];
  runnable: boolean;
  sort: Sort;
  text: string[];
}

export interface ProjectQuery {
  language: LanguageId[];
  text: string[];
}

export type ListKey =
  | "language"
  | "kind"
  | "difficulty"
  | "project"
  | "label"
  | "status";

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);
/** Qualifier names people type, mapped to the filter they set. */
const QUALIFIERS: Record<string, ListKey> = {
  lang: "language",
  language: "language",
  kind: "kind",
  type: "kind",
  difficulty: "difficulty",
  diff: "difficulty",
  project: "project",
  proj: "project",
  // Earlier name for projects, still understood.
  category: "project",
  cat: "project",
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
  project: [],
  label: [],
  status: [],
  runnable: false,
  sort: "key",
  text: [],
});

function first(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

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
      // is:runnable, and board statuses as is:todo or is:backlog,done.
      for (const raw of match![2].toLowerCase().split(",")) {
        const value = raw.trim();
        if (value === "runnable") query.runnable = true;
        else if (STATUSES.includes(value as Status))
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
        add(query[key] as string[], value);
    }
  }
  query.text = query.text.filter(Boolean);
  query.status = STATUSES.filter((st) => query.status.includes(st));
  return query;
}

export function parseProjectQuery(q: string): ProjectQuery {
  const { language, text } = parseIssueQuery(q);
  return { language, text };
}

/** The canonical query string: qualifiers first, in a fixed order, then free text. */
export function formatQuery(query: IssueQuery | ProjectQuery): string {
  const parts: string[] = [];
  if ("runnable" in query && query.runnable) parts.push("is:runnable");
  if ("status" in query && query.status.length)
    parts.push(
      `is:${STATUSES.filter((s) => query.status.includes(s)).join(",")}`,
    );
  const lists: [string, readonly string[]][] =
    "kind" in query
      ? [
          ["kind", query.kind],
          ["lang", query.language],
          ["difficulty", query.difficulty],
          ["project", query.project],
          ["label", query.label],
        ]
      : [["lang", query.language]];
  for (const [name, values] of lists)
    if (values.length) parts.push(`${name}:${values.join(",")}`);
  if ("sort" in query && query.sort !== "key") parts.push(`sort:${query.sort}`);
  parts.push(...query.text.map((t) => (/\s/.test(t) ? `"${t}"` : t)));
  return parts.join(" ");
}

/** The same query with one filter value switched on or off. */
export function toggle<Q extends IssueQuery | ProjectQuery>(
  query: Q,
  key: ListKey,
  value: string,
): Q {
  const current = (query as unknown as Record<ListKey, string[]>)[key];
  return {
    ...query,
    [key]: current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value],
  };
}

export function parseGroup(params: SearchParams): Group {
  const group = first(params, "group");
  return (GROUPS as readonly string[]).includes(group)
    ? (group as Group)
    : "project";
}

/** A list URL; the default grouping is left out to keep links short. */
export function href(
  path: string,
  query: IssueQuery | ProjectQuery,
  group: Group = "project",
): string {
  const params = new URLSearchParams();
  const q = formatQuery(query);
  if (q) params.set("q", q);
  if (group !== "project") params.set("group", group);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function queryParam(params: SearchParams): string {
  return first(params, "q");
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
    issue.project?.title ?? "",
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
        (query.project.length === 0 ||
          (!!issue.project && query.project.includes(issue.project.slug))) &&
        (query.label.length === 0 ||
          issue.labels.some((l) => query.label.includes(l))) &&
        (!query.runnable || issue.runnable) &&
        matchesText(issueText(issue), query.text),
    )
    .sort(SORTERS[query.sort]);
}

export function filterProjects(
  projects: readonly Project[],
  query: ProjectQuery,
): Project[] {
  return projects.filter(
    (project) =>
      (query.language.length === 0 ||
        project.issues.some(
          (i) => i.language && query.language.includes(i.language),
        )) &&
      matchesText(
        [
          project.key,
          project.slug,
          project.title,
          project.summary ?? "",
          project.story,
          ...project.issues.flatMap(issueText),
        ],
        query.text,
      ),
  );
}

type GroupableIssue = Pick<
  Issue,
  "key" | "project" | "kind" | "difficulty" | "language"
>;

export interface IssueGroup<T = Issue> {
  id: string;
  label: string;
  issues: T[];
}

/** Splits sorted issues into display groups, keeping each group's internal order. */
export function groupIssues<T extends GroupableIssue>(
  issues: readonly T[],
  group: Group,
  projects: readonly Pick<Project, "slug" | "title">[],
  statusOf: (key: string) => Status = () => "backlog",
): IssueGroup<T>[] {
  if (group === "none")
    return [{ id: "all", label: "All issues", issues: [...issues] }];
  const order: { id: string; label: string }[] =
    group === "project"
      ? projects.map((c) => ({ id: c.slug, label: c.title }))
      : group === "status"
        ? STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] }))
        : group === "kind"
          ? KINDS.map((k) => ({ id: k, label: k }))
          : group === "difficulty"
            ? DIFFICULTIES.map((d) => ({ id: d, label: d }))
            : LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const valueOf = (issue: T): string | undefined =>
    group === "project"
      ? issue.project?.slug
      : group === "status"
        ? statusOf(issue.key)
        : group === "kind"
          ? issue.kind
          : group === "difficulty"
            ? issue.difficulty
            : issue.language;
  const groups = [...order, { id: "", label: "Other" }].map((g) => ({
    ...g,
    issues: issues.filter((i) => (valueOf(i) ?? "") === g.id),
  }));
  return groups.filter((g) => g.issues.length > 0);
}
