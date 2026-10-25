import { ImageResponse } from "next/og";
import { LANGUAGES } from "../../../lib/languages";
import { getChallenges } from "../../../lib/load";
import { outcomeLines, outcomeSentence } from "../../../lib/outcome";
import { inspectCard } from "../../../lib/share";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A shared practice outcome";

/**
 * The picture a shared link shows in posts and chats: the outcome as a headline naming the
 * challenge, and the checks the card carries. Nothing the card doesn't say.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ card: string }>;
}) {
  // Only a card the page would show; anything else gets the plain invitation.
  const link = inspectCard((await params).card);
  const card = link.kind === "outcome" ? link.outcome : null;
  const label = card
    ? (LANGUAGES.find((l) => l.id === card.l)?.label ?? card.l)
    : "";
  // As on the page: a card for a retired challenge is not shown.
  const challenge = card ? (await getChallenges()).findChallenge(card.k) : undefined;
  const shown =
    challenge && card
      ? {
          headline: outcomeSentence(card, label, challenge.title),
          stats: outcomeLines(card),
        }
      : null;
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
          {shown && card
            ? `MUSCLE MEMORY · ${card.k} · ${label.toUpperCase()}`
            : "MUSCLE MEMORY"}
        </div>
        <div style={{ fontSize: 48, lineHeight: 1.2 }}>
          {shown ? shown.headline : "One challenge. Solve it at your own pace."}
        </div>
        {shown && (
          <div style={{ display: "flex" }}>
            {shown.stats.slice(0, 3).map(([text, value]) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginRight: 72,
                }}
              >
                <div style={{ fontSize: 76, color: "#ffffff" }}>{value}</div>
                <div style={{ fontSize: 26, color: "#9aa0b1" }}>{text}</div>
              </div>
            ))}
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
