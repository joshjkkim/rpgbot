"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_PAGES } from "./docPages";


export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-6 text-sm">
      {DOC_PAGES.map((g) => (
        <div key={g.group}>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">{g.group}</p>
          <ul className="space-y-0.5 border-l border-[var(--border)]">
            {g.pages.map((p) => {
              const active = pathname === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block border-l py-1 pl-3 transition-colors ${
                      active ? "border-[var(--accent)] text-[var(--gold)]" : "border-transparent text-[var(--muted)] hover:border-[var(--border-bright)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {p.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Previous and next guide, at the foot of every page. */
export function DocsPager() {
  const pathname = usePathname();
  const all = DOC_PAGES.flatMap((g) => g.pages);
  const i = all.findIndex((p) => p.href === pathname);
  const prev = all[i - 1];
  const next = all[i + 1];
  if (i < 0) return null;
  return (
    <div className="mt-16 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="rounded-sm border border-[var(--border)] p-3 hover:border-[var(--border-bright)]">
          <span className="block font-mono text-xs text-[var(--muted)]">← Previous</span>
          {prev.label}
        </Link>
      ) : <span />}
      {next && (
        <Link href={next.href} className="rounded-sm border border-[var(--border)] p-3 text-right hover:border-[var(--border-bright)]">
          <span className="block font-mono text-xs text-[var(--muted)]">Next →</span>
          {next.label}
        </Link>
      )}
    </div>
  );
}
