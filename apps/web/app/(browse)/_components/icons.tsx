/** Small inline icons in the style of developer trackers. 16px, currentColor unless noted. */
import type { IssueKind } from "../../../../../packages/domain/assessment";

type Props = { size?: number; className?: string };

const svg = (size: number, className = "icon") => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  className,
  "aria-hidden": true as const,
  fill: "none",
});

const KIND_COLORS: Record<IssueKind, string> = {
  feature: "var(--green)",
  bug: "var(--red)",
  performance: "var(--amber)",
  refactor: "var(--blue)",
};

export const KIND_LABELS: Record<IssueKind, string> = {
  feature: "Feature",
  bug: "Bug",
  performance: "Performance",
  refactor: "Refactor",
};

export function KindIcon({ kind, size = 16 }: Props & { kind?: IssueKind }) {
  const color = kind ? KIND_COLORS[kind] : "var(--faint)";
  return (
    <svg {...svg(size)}>
      <title>{kind ? KIND_LABELS[kind] : "Issue"}</title>
      {kind === "bug" ? (
        <>
          <circle cx="8" cy="8" r="6.5" fill={color} />
          <circle cx="8" cy="8" r="2.4" fill="var(--bg)" />
        </>
      ) : kind === "performance" ? (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill={color} />
          <path d="M8.8 3.5 5 8.8h2.6L6.9 12.5l4-5.4H8.3z" fill="var(--bg)" />
        </>
      ) : kind === "refactor" ? (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill={color} />
          <path
            d="M5 6.2h5.5L9 4.7M11 9.8H5.5L7 11.3"
            stroke="var(--bg)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill={color} />
          <path
            d="M8 5v6M5 8h6"
            stroke="var(--bg)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** "Todo" until per-person progress is tracked. */
export function StatusIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <title>Todo</title>
      <circle cx="8" cy="8" r="6" stroke="var(--faint)" strokeWidth="1.6" />
    </svg>
  );
}

export function IssuesIcon({ size = 16 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function CategoriesIcon({ size = 16 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect
        x="2"
        y="2"
        width="5"
        height="5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="9"
        y="2"
        width="5"
        height="5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2"
        y="9"
        width="5"
        height="5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="9"
        y="9"
        width="5"
        height="5"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function TerminalIcon({ size = 16 }: Props) {
  return (
    <svg {...svg(size)}>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m4.5 6 2 2-2 2M8 10.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <circle cx="7" cy="7" r="4.5" stroke="var(--faint)" strokeWidth="1.5" />
      <path
        d="m10.5 10.5 3 3"
        stroke="var(--faint)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FilterIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <path
        d="M2.5 4h11M4.5 8h7M6.5 12h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DisplayIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <path
        d="M2.5 4.5h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="10"
        cy="4.5"
        r="1.8"
        fill="var(--panel)"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle
        cx="6"
        cy="11.5"
        r="1.8"
        fill="var(--panel)"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function PlayIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}
