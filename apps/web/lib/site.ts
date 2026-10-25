import type { Metadata } from "next";

export const SITE_NAME = "Muscle Memory";
/** Where absolute links in previews point; the production hostname unless set. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://musclememory.run";
export const SITE_DESCRIPTION =
  "You can ship with AI. Can you still code without it? Pick a challenge, write the solution yourself, and see what comes back naturally.";
/** The terminal's background, for the browser chrome and the manifest. */
export const THEME_COLOR = "#0f1012";

/**
 * A public page's metadata: its title under the site's template and a canonical URL without
 * the query (?ref, ?lang). Link previews come from the layout's Open Graph, which Next fills
 * with this title and description; a page that sets its own `openGraph` loses the inherited
 * image, so only pages with their own opengraph-image should.
 */
export function pageMetadata({
  title,
  description,
  path,
  absolute = false,
}: {
  /** Without the site name, unless `absolute`. */
  title: string;
  description: string;
  path: string;
  absolute?: boolean;
}): Metadata {
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
  };
}

/** For pages that are someone's own or a step on the way in: not for search results. */
export const NOT_INDEXED: Metadata["robots"] = { index: false, follow: true };
