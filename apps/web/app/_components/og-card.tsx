import type { ReactNode } from "react";

/**
 * The frame every link preview image uses (1200×630): a small caps line on top, the headline,
 * anything in between, and a line naming the site at the bottom. Styles are inline, as
 * ImageResponse needs; every element with more than one child is a flex box.
 */
export function OgCard({
  eyebrow,
  headline,
  footer,
  children,
}: {
  eyebrow: string;
  headline: string;
  footer: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "#0f1117",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 26, color: "#b69cff", letterSpacing: 2 }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: 48, lineHeight: 1.2 }}>{headline}</div>
      {children}
      <div style={{ fontSize: 30, color: "#cfd2db" }}>{footer}</div>
    </div>
  );
}
