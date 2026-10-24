import Link from "next/link";
import {
  toSearch,
  toggle,
  type CategoryQuery,
  type IssueQuery,
} from "../../../lib/queries";

export interface FilterGroup<Q> {
  key: Exclude<keyof Q, "q">;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Search box plus toggleable filter chips. Every state is a plain URL, so results are
 * shareable and the page works without JavaScript.
 */
export function Filters<Q extends IssueQuery | CategoryQuery>({
  path,
  query,
  groups,
  placeholder,
}: {
  path: string;
  query: Q;
  groups: FilterGroup<Q>[];
  placeholder: string;
}) {
  return (
    <>
      <form className="search" action={path} role="search">
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          placeholder={placeholder}
          aria-label="Search"
        />
        {/* Keep the current filters when searching. */}
        {groups.flatMap(({ key }) =>
          (query[key] as unknown as string[]).map((value) => (
            <input
              key={`${String(key)}-${value}`}
              type="hidden"
              name={String(key)}
              value={value}
            />
          )),
        )}
        <button className="button" type="submit">
          Search
        </button>
      </form>
      <div className="filters">
        {groups.map(({ key, label, options }) => (
          <div
            className="filter"
            key={String(key)}
            role="group"
            aria-label={label}
          >
            <span>{label}</span>
            {options.map(({ value, label: text }) => {
              const on = (query[key] as unknown as string[]).includes(value);
              return (
                <Link
                  key={value}
                  className="chip"
                  href={path + toSearch(toggle(query, key, value))}
                  aria-current={on ? "true" : undefined}
                  scroll={false}
                >
                  {text}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
