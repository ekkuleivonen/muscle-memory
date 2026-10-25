import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/**
 * Everything may be crawled: pages that shouldn't be in results say so with noindex, which a
 * crawler can only read if it may fetch them. Cloudflare prepends its content signals.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
