import { ImageResponse } from "next/og";
import { OgCard } from "./_components/og-card";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Muscle Memory: you can ship with AI. Can you still code without it?";

/** The picture any page without its own shows when its link is shared: the home page's question. */
export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="MUSCLE MEMORY"
        headline="You can ship with AI. Can you still code without it?"
        footer="Coding challenges you solve yourself. → musclememory.run"
      />
    ),
    size,
  );
}
