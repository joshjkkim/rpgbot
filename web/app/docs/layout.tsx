import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/app/components/siteChrome";
import { DocsNav, DocsPager } from "./docsNav";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · havocish docs" },
  description: "How to set up and run havocish, the Discord RPG bot: commands, XP, economy, combat, gathering and the dashboard.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-8">
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-6"><DocsNav /></div>
        </aside>
        <main className="min-w-0 max-w-3xl flex-1 pb-16">
          {/* On small screens the sidebar becomes a menu above the page. */}
          <details className="mb-6 rounded-sm border border-[var(--border)] px-4 py-2 md:hidden">
            <summary className="cursor-pointer font-mono text-sm text-[var(--muted)]">Docs menu</summary>
            <div className="mt-3"><DocsNav /></div>
          </details>
          {children}
          <DocsPager />
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
