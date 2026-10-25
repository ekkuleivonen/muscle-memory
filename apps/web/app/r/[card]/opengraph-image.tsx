import { ImageResponse } from "next/og";
import { LANGUAGES } from "../../../lib/languages";
import { getLibrary } from "../../../lib/load";
import { sentence } from "../../../lib/result";
import { inspectCard } from "../../../lib/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A self-reported practice outcome";

/**
 * The picture a shared link shows in posts and chats: the outcome as a headline naming the
 * challenge, and its numbers.
 */
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
  // As on the page: a card for a retired challenge is not shown.
  const issue = result ? (await getLibrary()).findIssue(result.k) : undefined;
  const shown = issue ? result : null;
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
          {shown
            ? `MUSCLE MEMORY · ${shown.k} · PRACTICE WITHOUT AI`
            : "MUSCLE MEMORY · PRACTICE WITHOUT AI"}
        </div>
        <div style={{ fontSize: 48, lineHeight: 1.2 }}>
          {shown && issue
            ? sentence({ ...shown, fp: undefined }, label, issue.title)
            : "One challenge. No AI. Solve it at your own pace."}
        </div>
        {shown && (
          <div style={{ display: "flex" }}>
            {shown.ev ? (
              <>
                {stat(
                  `${shown.ev.checks.passed}/${shown.ev.checks.total}`,
                  "checks passed",
                )}
                {stat(
                  shown.ev.first
                    ? `${shown.ev.first.passed}/${shown.ev.first.total}`
                    : "?",
                  "first full check",
                )}
                {stat(String(shown.ev.pushes), "full checks run")}
              </>
            ) : (
              stat(String(shown.r), "example runs")
            )}
          </div>
        )}
        <div style={{ fontSize: 30, color: "#cfd2db" }}>
          {"One practice attempt, as the person shared it. → musclememory.run"}
        </div>
      </div>
    ),
    size,
  );
}
