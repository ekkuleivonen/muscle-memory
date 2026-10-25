import { ImageResponse } from "next/og";
import { hookFor } from "../../../lib/hooks";
import { languageLabel } from "../../../lib/library";
import { getLibrary } from "../../../lib/load";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A coding challenge";

/**
 * The picture a shared challenge link shows in posts and chats: which challenge it is, in
 * which language, and its selected hook or else its one-line goal. Nothing of the sender: the link names only the
 * challenge.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const issue = (await getLibrary()).findIssue(decodeURIComponent(key));
  const line = issue ? (hookFor(issue) ?? issue.summary) : "";
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
          {issue
            ? `MUSCLE MEMORY · ${issue.key} · ${languageLabel(issue.language).toUpperCase()}`
            : "MUSCLE MEMORY"}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 56, lineHeight: 1.15 }}>
            {issue ? issue.title : "One challenge."}
          </div>
          {line && (
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.35,
                color: "#cfd2db",
                marginTop: 24,
              }}
            >
              {line}
            </div>
          )}
        </div>
        <div style={{ fontSize: 30, color: "#cfd2db" }}>
          {
            "Solve it yourself. The editor has no AI assistance. → musclememory.run"
          }
        </div>
      </div>
    ),
    size,
  );
}
