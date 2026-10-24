import type { CSSProperties } from "react";
import { LANGUAGES } from "../../../lib/languages";
import { languageLabel, type CategoryRef } from "../../../lib/library";

type HueStyle = CSSProperties & { "--h": number };

/** A stable hue for free-form text such as label or author names. */
export function hueOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function LabelPill({ label }: { label: string }) {
  return (
    <span className="pill" style={{ "--h": hueOf(label) } as HueStyle}>
      {label}
    </span>
  );
}

export function LanguageTag({ language }: { language?: string }) {
  const color =
    LANGUAGES.find((l) => l.id === language)?.color ?? "var(--faint)";
  return (
    <span className="tag">
      <span className="dot" style={{ background: color }} />
      {languageLabel(language)}
    </span>
  );
}

export function LanguageDot({ language }: { language: string }) {
  const color = LANGUAGES.find((l) => l.id === language)?.color;
  return <span className="dot" style={{ background: color }} />;
}

export function Estimate({ points }: { points?: number }) {
  return points ? (
    <span
      className="estimate"
      title={`Estimate: ${points} point${points === 1 ? "" : "s"}`}
    >
      {points}
    </span>
  ) : null;
}

/** Category colours spread evenly around the wheel. */
export function CategorySquare({
  category,
}: {
  category: Pick<CategoryRef, "hue">;
}) {
  return (
    <span className="square" style={{ "--h": category.hue * 45 } as HueStyle} />
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ "--h": hueOf(name) } as HueStyle}
    >
      {initials}
    </span>
  );
}
