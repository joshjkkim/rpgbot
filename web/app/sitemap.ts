import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site";
import { DOC_PAGES } from "./docs/docPages";

/** Every public page. Docs come from the docs nav, so a new docs page lands here by itself. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/features", "/changelog", ...DOC_PAGES.flatMap((g) => g.pages.map((p) => p.href)), "/legal/terms", "/legal/privacy"];
  return pages.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    priority: path === "/" ? 1 : path === "/features" || path === "/docs" ? 0.8 : 0.5,
  }));
}
