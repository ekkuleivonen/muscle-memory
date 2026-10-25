import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, THEME_COLOR } from "../lib/site";
import { SiteTracker } from "./_components/site-tracker";
import { Uploads } from "./_components/uploads";
import "./style.css";
export const metadata: Metadata = {
  // Absolute links for shared previews (og:image, og:url, canonical).
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: "en_US", type: "website" },
  // X shows a large card only when asked; it takes the rest from Open Graph.
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { themeColor: THEME_COLOR, colorScheme: "dark" };
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
