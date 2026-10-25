import { ImageResponse } from "next/og";
import { OgCard } from "../_components/og-card";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "I read code every day. Then I tried writing some. Why Muscle Memory exists.";

/** The manifesto's preview: its title, and whose words they are. */
export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="MUSCLE MEMORY · MANIFESTO"
        headline="I read code every day. Then I tried writing some."
        footer="Ekku Leivonen on why Muscle Memory exists. → musclememory.run"
      />
    ),
    size,
  );
}
