import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackerActivity } from "./(browse)/_components/tracker-activity";
import { Uploads } from "./(browse)/_components/uploads";
import { THEME_SCRIPT } from "../lib/theme";
import "./style.css";
export const metadata: Metadata = {
  // Absolute links for shared previews (og:image); the production hostname unless set.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://musclememory.run"),
  title: "Muscle Memory — keep your craft",
  description:
    "Use AI at work. Write this one yourself: realistic issues, tests and pull requests, with nobody writing the code for you.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The theme script sets data-theme before React hydrates, hence the warning suppressed.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        {/* Reads the URL's query, which needs a boundary on statically rendered pages. */}
        <Suspense fallback={null}>
          <TrackerActivity />
        </Suspense>
        <Uploads />
      </body>
    </html>
  );
}
