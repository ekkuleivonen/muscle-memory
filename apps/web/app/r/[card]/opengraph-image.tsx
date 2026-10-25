import { ImageResponse } from "next/og";
import { LANGUAGES } from "../../../lib/languages";
import { sentence } from "../../../lib/result";
import { inspectCard } from "../../../lib/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A self-reported practice outcome";

/** The picture a shared link shows in posts and chats: the result as a headline and numbers. */
export default async function Image({
  params,
}: {
  params: Promise<{ card: string }>;
}) {
  // Only a card the page would show; anything else gets the plain invitation.
  const link = inspectCard((await params).card);
  const result = link.kind === "result" ? link.result : null;
  const label = result
    ? (LANGUAGES.find((l) => l.id === result.l)?.label ?? result.l)
    : "";
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
          {result
            ? `MUSCLE MEMORY · ${result.k} · PRACTICE WITHOUT AI`
            : "MUSCLE MEMORY · PRACTICE WITHOUT AI"}
        </div>
        <div style={{ fontSize: 52, lineHeight: 1.2 }}>
          {result
            ? sentence({ ...result, fp: undefined }, label)
            : "One bug. No AI. Try a small fix at your own pace."}
        </div>
        {result && (
          <div style={{ display: "flex" }}>
            {result.ev ? (
              <>
                {stat(
                  `${result.ev.checks.passed}/${result.ev.checks.total}`,
                  "latest checks",
                )}
                {stat(
                  result.ev.first
                    ? `${result.ev.first.passed}/${result.ev.first.total}`
                    : "?",
                  "first submission",
                )}
                {stat(String(result.ev.pushes), "pushes")}
              </>
            ) : (
              stat(String(result.r), "recorded test runs")
            )}
          </div>
        )}
        <div style={{ fontSize: 30, color: "#cfd2db" }}>
          {
            "One practice attempt. Production outcome not measured. → musclememory.run"
          }
        </div>
      </div>
    ),
    size,
  );
}
