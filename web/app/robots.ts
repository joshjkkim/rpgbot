import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site";

/** Search engines get the public site; the dashboard and API are behind a login anyway. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
