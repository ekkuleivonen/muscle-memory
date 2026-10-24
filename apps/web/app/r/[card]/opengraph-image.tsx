import { ImageResponse } from "next/og";
import { LANGUAGES } from "../../../lib/languages";
import { decodeResult, sentence } from "../../../lib/result";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A result from the five-minute test";

/** The picture a shared link shows in posts and chats: the result as a headline and numbers. */
export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const result = decodeResult((await params).card);
  const label = result ? (LANGUAGES.find((l) => l.id === result.l)?.label ?? result.l) : "";
  const stat = (value: string, text: string) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 72 }}>
      <div style={{ fontSize: 76, color: "#ffffff" }}>{value}</div>
      <div style={{ fontSize: 26, color: "#9aa0b1" }}>{text}</div>
    </div>
  );
  return new ImageResponse(
    (
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
          MUSCLE MEMORY · SHIPPED WITHOUT AI
        </div>
        <div style={{ fontSize: 52, lineHeight: 1.2 }}>
          {result ? sentence(result, label) : "One bug. No AI. Can you still fix it?"}
        </div>
        {result && (
          <div style={{ display: "flex" }}>
            {stat(String(result.ks), "keystrokes")}
            {stat(String(result.ty), "typos fixed")}
            {result.w ? stat(String(result.w), "wpm peak") : null}
            {stat(String(result.ps), result.ps === 1 ? "paste" : "pastes")}
          </div>
        )}
        <div style={{ fontSize: 30, color: "#cfd2db" }}>
          You use AI every day. Can you still code without it? → musclememory.run
        </div>
      </div>
    ),
    size,
  );
}
