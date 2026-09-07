"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";

const sections = [
    {
        label: "Settings",
        tabs: [
            { href: "", label: "Overview" },
            { href: "styles", label: "Style" },
            { href: "xp", label: "XP" },
            { href: "shop", label: "Economy" },
            { href: "achievements", label: "Achievements" },
            { href: "levels", label: "Levels" },
            { href: "quests", label: "Quests" },
            { href: "combat", label: "Combat" },
            { href: "logging", label: "Logging" },
        ],
    },
    {
        label: "Analytics",
        tabs: [
            { href: "logs", label: "Logs" },
        ],
    },
];

function NavSection({ section, guildId }: { section: typeof sections[0]; guildId: string }) {
    const [open, setOpen] = useState(true);
    const pathname = usePathname();

    return (
        <div className="mb-4">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
                <span>{section.label}</span>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {open && (
                <div className="mt-1 space-y-0.5">
                    {section.tabs.map((t) => {
                        const href = `/dashboard/${guildId}${t.href ? `/${t.href}` : ""}`;
                        const active = pathname === href;

                        return (
                            <Link
                                key={t.label}
                                href={href}
                                aria-current={active ? "page" : undefined}
                                className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                                    active
                                        ? "bg-[var(--accent)] font-medium"
                                        : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                                }`}
                            >
                                {t.label}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function Sidebar({
    guildId,
    guildName,
    guildIconUrl,
}: {
    guildId: string;
    guildName?: string | null;
    guildIconUrl?: string | null;
}) {
    return (
        <aside className="border-r border-[var(--border)] bg-[var(--surface)] p-4">
            <Link
                href="/dashboard"
                className="mb-5 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
                <ArrowLeft size={13} />
                All servers
            </Link>

            <div className="mb-6 flex items-center gap-2.5">
                {guildIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={guildIconUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                    <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--border)]" />
                )}
                <div className="min-w-0">
                    {/* Falls back to the id when the bot has not recorded a name yet. */}
                    <div className="truncate text-sm font-semibold">{guildName ?? guildId}</div>
                </div>
            </div>

            <nav>
                {sections.map((section) => (
                    <NavSection key={section.label} section={section} guildId={guildId} />
                ))}
            </nav>
        </aside>
    );
}
