import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/** The public pages. Challenges and settings sit behind the Terms, so they aren't listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/start", "/manifesto", "/terms", "/privacy"].map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
  }));
}
