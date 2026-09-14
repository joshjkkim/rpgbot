"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
    Activity,
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Coins,
    FileText,
    LayoutGrid,
    Palette,
    ScrollText,
    Sparkles,
    Swords,
    TrendingUp,
    Trophy,
} from "lucide-react";

const sections = [
    {
        label: "Settings",
        tabs: [
            { href: "", label: "Overview", icon: LayoutGrid },
            { href: "styles", label: "Style", icon: Palette },
            { href: "xp", label: "XP", icon: Sparkles },
            { href: "shop", label: "Economy", icon: Coins },
            { href: "achievements", label: "Achievements", icon: Trophy },
            { href: "levels", label: "Levels", icon: TrendingUp },
            { href: "quests", label: "Quests", icon: ScrollText },
            { href: "combat", label: "Combat", icon: Swords },
            { href: "logging", label: "Logging", icon: FileText },
        ],
    },
    {
        label: "Analytics",
        tabs: [
            { href: "logs", label: "Logs", icon: Activity },
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
                className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
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
                                className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
                                    active
                                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/12 font-medium text-[var(--accent)]"
                                        : "border-transparent text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
                                }`}
                            >
                                <t.icon size={16} className="shrink-0" />
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
        <aside className="border-r border-[var(--border)] bg-[var(--surface)]/85 p-4 backdrop-blur">
            <Link
                href="/dashboard"
                className="mb-5 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
                <ArrowLeft size={13} />
                All servers
            </Link>

            <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-2.5">
                {guildIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={guildIconUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-[var(--accent)]/50"
                    />
                ) : (
                    <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--border)] ring-2 ring-[var(--accent)]/50" />
                )}
                <div className="min-w-0">
                    {/* Falls back to the id when the bot has not recorded a name yet. */}
                    <div className="truncate text-sm font-semibold">{guildName ?? guildId}</div>
                    <div className="text-[11px] text-[var(--muted)]">Server settings</div>
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
