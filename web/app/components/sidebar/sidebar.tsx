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
                className="flex w-full items-center justify-between px-2 py-1.5 font-display text-xs uppercase tracking-[0.15em] text-[var(--accent)]/80 transition-colors hover:text-[var(--gold)]"
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
                                className={`flex items-center gap-2.5 rounded-sm border px-2.5 py-1.5 text-sm transition-colors ${
                                    active
                                        ? "border-[var(--border-bright)] bg-[var(--accent)]/10 text-[var(--gold)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.6)]"
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
        <aside className="border-r border-[var(--border-bright)]/60 bg-[linear-gradient(180deg,var(--surface-2),var(--surface))] p-4 shadow-[inset_-1px_0_0_#000]">
            <Link
                href="/dashboard"
                className="mb-5 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
                <ArrowLeft size={13} />
                All servers
            </Link>

            <div className="frame mb-6 flex items-center gap-2.5 p-2.5">
                {guildIconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={guildIconUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-bright)] object-cover shadow-[0_0_0_1px_#000]"
                    />
                ) : (
                    <div className="h-9 w-9 shrink-0 rounded-full border border-[var(--border-bright)] bg-[var(--border)] shadow-[0_0_0_1px_#000]" />
                )}
                <div className="min-w-0">
                    {/* Falls back to the id when the bot has not recorded a name yet. */}
                    <div className="truncate font-display text-sm text-[var(--gold)]">{guildName ?? guildId}</div>
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
