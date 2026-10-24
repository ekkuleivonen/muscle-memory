import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatQuery,
  GROUPS,
  href,
  SORTS,
  toggle,
  type CategoryQuery,
  type Group,
  type IssueQuery,
  type ListKey,
} from "../../../lib/queries";
import { DisplayIcon, FilterIcon, SearchIcon } from "./icons";

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}
export interface FilterSpec {
  key: ListKey;
  label: string;
  options: FilterOption[];
}

function Check({ on }: { on: boolean }) {
  return <span className="check">{on ? "✓" : ""}</span>;
}

/**
 * Search box that understands qualifiers, plus filter and display menus that rewrite the
 * same query. Every state is a plain link, so it works without JavaScript and can be shared.
 */
export function Toolbar<Q extends IssueQuery | CategoryQuery>({
  path,
  query,
  group,
  filters,
  placeholder,
}: {
  path: string;
  query: Q;
  group?: Group;
  filters: FilterSpec[];
  placeholder: string;
}) {
  const selected = (key: ListKey) =>
    ((query as unknown as Record<string, string[]>)[key] ?? []) as string[];
  const isIssues = "runnable" in query;
  return (
    <>
      <div className="toolbar">
        <form className="search" action={path} role="search">
          <SearchIcon />
          <input
            type="search"
            name="q"
            defaultValue={formatQuery(query)}
            placeholder={placeholder}
            aria-label="Search"
            data-search
            spellCheck={false}
            autoComplete="off"
          />
          {group && group !== "category" && (
            <input type="hidden" name="group" value={group} />
          )}
          <kbd>/</kbd>
        </form>
        <details className="menu">
          <summary className="btn">
            <FilterIcon /> Filter
          </summary>
          <div className="menu-pop" role="menu">
            {filters.map(({ key, label, options }) => (
              <div key={key}>
                <h6>{label}</h6>
                {options.map(({ value, label: text, icon }) => (
                  <Link
                    key={value}
                    role="menuitemcheckbox"
                    aria-checked={selected(key).includes(value)}
                    className="menu-item"
                    href={href(path, toggle(query, key, value), group)}
                    scroll={false}
                  >
                    <Check on={selected(key).includes(value)} />
                    {icon}
                    {text}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </details>
        {isIssues && (
          <Link
            className="btn"
            aria-pressed={(query as IssueQuery).runnable}
            href={href(
              path,
              {
                ...(query as IssueQuery),
                runnable: !(query as IssueQuery).runnable,
              },
              group,
            )}
            scroll={false}
          >
            Runs in browser
          </Link>
        )}
        {isIssues && group && (
          <details className="menu right">
            <summary className="btn">
              <DisplayIcon /> Display
            </summary>
            <div className="menu-pop" role="menu">
              <h6>Group by</h6>
              {GROUPS.map((g) => (
                <Link
                  key={g}
                  role="menuitemradio"
                  aria-checked={g === group}
                  className="menu-item"
                  href={href(path, query, g)}
                  scroll={false}
                >
                  <Check on={g === group} />
                  {g === "none"
                    ? "No grouping"
                    : g[0].toUpperCase() + g.slice(1)}
                </Link>
              ))}
              <h6>Order by</h6>
              {SORTS.map((sort) => (
                <Link
                  key={sort}
                  role="menuitemradio"
                  aria-checked={(query as IssueQuery).sort === sort}
                  className="menu-item"
                  href={href(path, { ...(query as IssueQuery), sort }, group)}
                  scroll={false}
                >
                  <Check on={(query as IssueQuery).sort === sort} />
                  {sort === "key"
                    ? "Issue key"
                    : sort[0].toUpperCase() + sort.slice(1)}
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
      <ActiveFilters
        path={path}
        query={query}
        group={group}
        filters={filters}
      />
    </>
  );
}

function ActiveFilters<Q extends IssueQuery | CategoryQuery>({
  path,
  query,
  group,
  filters,
}: {
  path: string;
  query: Q;
  group?: Group;
  filters: FilterSpec[];
}) {
  const chips: { key: string; field: string; value: string; remove: string }[] =
    [];
  for (const { key, label, options } of filters)
    for (const value of (query as unknown as Record<string, string[]>)[key] ??
      [])
      chips.push({
        key: `${key}:${value}`,
        field: label,
        value: options.find((o) => o.value === value)?.label ?? value,
        remove: href(path, toggle(query, key, value), group),
      });
  if ("label" in query)
    for (const value of query.label)
      if (!filters.some((f) => f.key === "label"))
        chips.push({
          key: `label:${value}`,
          field: "Label",
          value,
          remove: href(path, toggle(query, "label", value), group),
        });
  if (!chips.length) return null;
  return (
    <div className="active-filters">
      {chips.map((chip) => (
        <span className="filter-chip" key={chip.key}>
          {chip.field} is <b>{chip.value}</b>
          <Link
            className="x"
            href={chip.remove}
            aria-label={`Remove ${chip.field} ${chip.value}`}
            scroll={false}
          >
            ×
          </Link>
        </span>
      ))}
      <Link
        className="filter-chip"
        href={href(path, { ...query, ...clearFilters(query) }, group)}
        scroll={false}
      >
        Clear
      </Link>
    </div>
  );
}

function clearFilters(query: IssueQuery | CategoryQuery) {
  return "kind" in query
    ? { language: [], kind: [], difficulty: [], category: [], label: [] }
    : { language: [] };
}
