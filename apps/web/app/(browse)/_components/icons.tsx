/** Small inline icons in the style of developer trackers. 16px, currentColor unless noted. */
import type { IssueKind } from "../../../../../packages/content/model";

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

export function PlayIcon({ size = 14 }: Props) {
  return (
    <svg {...svg(size)}>
      <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
    </svg>
  );
}
