import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Inline } from "@/app/components/ui/markdown";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in havocish, the Discord RPG bot.",
};

/*
 * Renders the repo's CHANGELOG.md, read once at build time, so the page and the
 * support-server posts (havocish/scripts/changelog-post.ts) come from one file.
 * The file sticks to ##/### headings, "- " bullets and **bold**, *italic* and
 * `code`, which components/ui/markdown.tsx covers without a dependency.
 */

const CHANGELOG = readFileSync(path.join(process.cwd(), "..", "CHANGELOG.md"), "utf8");

export default function ChangelogPage() {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets.map((b, i) => <li key={i}><Inline text={b} /></li>)}</ul>);
    bullets = [];
  };

  for (const line of CHANGELOG.split("\n")) {
    if (line.startsWith("- ")) { bullets.push(line.slice(2)); continue; }
    flush();
    if (line.startsWith("### ")) blocks.push(<h3 key={blocks.length} className="mt-5 font-display text-[var(--accent)]">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={blocks.length}>{line === "## Unreleased" ? "Coming in the next update" : line.slice(3)}</h2>);
    else if (line.startsWith("# ")) blocks.push(<h1 key={blocks.length}>{line.slice(2)}</h1>);
    else if (line.trim()) blocks.push(<p key={blocks.length}><Inline text={line} /></p>);
  }
  flush();

  return <>{blocks}</>;
}
