/** The docs pages, in nav order. Plain data, so the sitemap (a server file) can read it too. */
export const DOC_PAGES = [
  {
    group: "Start here",
    pages: [
      { href: "/docs", label: "Getting started" },
      { href: "/docs/commands", label: "Commands" },
    ],
  },
  {
    group: "Guides",
    pages: [
      { href: "/docs/xp-and-levels", label: "XP and levels" },
      { href: "/docs/economy", label: "Economy and items" },
      { href: "/docs/combat", label: "Combat" },
      { href: "/docs/gathering", label: "Gathering" },
      { href: "/docs/crafting", label: "Crafting" },
      { href: "/docs/quests", label: "Quests, achievements and collections" },
      { href: "/docs/dashboard", label: "Dashboard and tools" },
    ],
  },
];
