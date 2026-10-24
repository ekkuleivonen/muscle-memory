import { ImageResponse } from "next/og";
import { LANGUAGES } from "../../../lib/languages";
import { decodeResult } from "../../../lib/result";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A result from the five-minute test";

/** The picture a shared link shows in posts and chats: the result, large. */
export default async function Image({ params }: { params: Promise<{ card: string }> }) {
  const result = decodeResult((await params).card);
  const label = result ? (LANGUAGES.find((l) => l.id === result.l)?.label ?? result.l) : "";
  const stat = (value: string, text: string) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 64 }}>
      <div style={{ fontSize: 88, fontWeight: 700, color: "#111" }}>{value}</div>
      <div style={{ fontSize: 30, color: "#666" }}>{text}</div>
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
          padding: 72,
          background: "#f7f7fb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, color: "#5b5bd6", fontWeight: 600 }}>
          MUSCLE MEMORY · SHIPPED WITHOUT AI
        </div>
        {result ? (
          <div style={{ display: "flex" }}>
            {stat(String(result.m), result.m === 1 ? "minute" : "minutes")}
            {stat(String(result.r), result.r === 1 ? "test run" : "test runs")}
            {stat(result.h ? String(result.h) : "No", result.h === 1 ? "hint" : "hints")}
            {stat(label, `${result.k}`)}
          </div>
        ) : (
          <div style={{ fontSize: 72, fontWeight: 700 }}>The five-minute test</div>
        )}
        <div style={{ fontSize: 40, fontWeight: 700, color: "#111" }}>
          You use AI every day. Can you still code without it?
        </div>
      </div>
    ),
    size,
  );
}
