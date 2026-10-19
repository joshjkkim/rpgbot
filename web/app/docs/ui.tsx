/*
 * The docs' building blocks. Plainer than the rest of the site on purpose:
 * readable body text, monospace for anything typed into Discord, and tables for
 * settings, so owners can scan for the one value they came for.
 */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function DocTitle({ path, title, lead }: { path: string; title: string; lead: React.ReactNode }) {
  return (
    <header className="mb-10 border-b border-[var(--border)] pb-6">
      <p className="font-mono text-xs text-[var(--muted)]">docs / {path}</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-[var(--foreground)]/80">{lead}</p>
    </header>
  );
}

/** A section heading with its own link, so a guide can be shared by section. */
export function H2({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h2 id={id} className="group mt-12 mb-4 scroll-mt-6 font-sans text-xl font-semibold text-[var(--foreground)]">
      <a href={`#${id}`} className="no-underline">
        {children}
        <span className="ml-2 font-mono text-sm text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100">#</span>
      </a>
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 font-sans text-base font-semibold text-[var(--foreground)]">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="my-4 leading-7 text-[var(--foreground)]/85">{children}</p>;
}

/** Anything typed into Discord or read off the dashboard verbatim. */
export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm border border-[var(--border)] bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--gold)]">{children}</code>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="my-4 list-disc space-y-1.5 pl-6 leading-7 text-[var(--foreground)]/85 marker:text-[var(--accent)]">{children}</ul>;
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="my-4 list-decimal space-y-2 pl-6 leading-7 text-[var(--foreground)]/85 marker:font-mono marker:text-[var(--accent)]">{children}</ol>;
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-sm border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-black/40">
          <tr>{head.map((h) => <th key={h} className="border-b border-[var(--border)] px-3 py-2 font-mono text-xs font-normal uppercase tracking-wide text-[var(--muted)]">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)]/60 last:border-0 align-top">
              {r.map((cell, j) => <td key={j} className="px-3 py-2 leading-6 text-[var(--foreground)]/85">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Note({ kind = "note", children }: { kind?: "note" | "warning"; children: React.ReactNode }) {
  const warn = kind === "warning";
  return (
    <div className={`my-5 rounded-sm border-l-2 px-4 py-3 text-sm leading-6 ${warn ? "border-[#c96b5b] bg-[#c96b5b]/10" : "border-[var(--accent)] bg-[var(--accent)]/5"}`}>
      <p className={`mb-1 font-mono text-xs uppercase tracking-wide ${warn ? "text-[#d98b7d]" : "text-[var(--accent)]"}`}>{warn ? "Watch out" : "Note"}</p>
      <div className="text-[var(--foreground)]/85">{children}</div>
    </div>
  );
}

/** Where a setting lives on the dashboard, written the same way everywhere. */
export function Where({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.85em] text-[var(--muted)]">Dashboard → {children}</span>;
}
