import Link from "next/link";

/**
 * The shell both legal pages share: a parchment-coloured scroll on the stone
 * background, plus the prose rules. Descendant variants keep the styling here
 * instead of repeated on every heading and paragraph in the two pages.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--accent)]">
          ← Back to havocish
        </Link>

        <article
          className="frame mt-4 px-7 py-9 text-[0.95rem] leading-relaxed sm:px-10
            [&_a]:text-[var(--accent)] [&_a]:underline [&_a]:decoration-[var(--border-bright)]
            [&_a:hover]:text-[var(--accent-hover)]
            [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-[var(--gold)]
            [&_h1]:text-3xl
            [&_h2]:mt-9 [&_h2]:border-b [&_h2]:border-[var(--border)] [&_h2]:pb-1.5
            [&_h2]:text-xl [&_h2]:text-[var(--gold)]
            [&_li]:mt-1.5 [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-[var(--accent)]
            [&_p]:mt-3.5 [&_p]:text-[var(--foreground)]
            [&_strong]:text-[var(--gold)] [&_strong]:font-normal
            [&_ul]:mt-3"
        >
          {children}
        </article>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          <Link href="/legal/terms" className="hover:text-[var(--accent)]">Terms of Service</Link>
          {" · "}
          <Link href="/legal/privacy" className="hover:text-[var(--accent)]">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
