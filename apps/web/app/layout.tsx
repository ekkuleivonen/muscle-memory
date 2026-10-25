import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteTracker } from "./_components/site-tracker";
import { Uploads } from "./_components/uploads";
import "./style.css";
export const metadata: Metadata = {
  // Absolute links for shared previews (og:image); the production hostname unless set.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://musclememory.run"),
  title: "Muscle Memory — keep your craft",
  description:
    "Use AI at work. Write this one yourself: coding challenges with direct feedback, and nobody writing the code for you.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Reads the URL's query, which needs a boundary on statically rendered pages. */}
        <Suspense fallback={null}>
          <SiteTracker />
        </Suspense>
        <Uploads />
      </body>
    </html>
  );
}
