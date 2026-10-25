import Link from "next/link";

/** Where a feature's announcement settings went: the Announcements page, which holds them all. */
export function AnnouncedOn({ what }: { what: string }) {
  return (
    <p className="text-sm text-[var(--muted)]">
      Where {what} {what.endsWith("s") ? "are" : "is"} announced, and in what words, is on the{" "}
      <Link href="announcements" className="text-[var(--accent)] hover:underline">Announcements</Link> page.
    </p>
  );
}
