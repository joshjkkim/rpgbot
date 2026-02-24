"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

    return (
        <div className="mb-3">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:text-white transition-colors"
            >
                <span>{section.label}</span>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {open && (
                <div className="mt-1 space-y-1">
                    {section.tabs.map((t) => (
                        <Link
                            key={t.label}
                            href={`/dashboard/${guildId}/${t.href}`}
                            className="block rounded px-3 py-2 text-sm shadow-lg transition-all duration-250 ease-out border-transparent hover:bg-blue-800 border-2 hover:border-blue-500 hover:scale-105"
                        >
                            {t.label}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Sidebar({ guildId }: { guildId: string }) {
    return (
        <aside className="border-r bg-gradient-to-br from-black via-black to-blue-900 p-4">
            <div className="mb-4">
                <div className="text-xs text-zinc-400">Guild</div>
                <div className="font-semibold break-all">{guildId}</div>
            </div>
            <nav>
                {sections.map((section) => (
                    <NavSection key={section.label} section={section} guildId={guildId} />
                ))}
            </nav>
        </aside>
    );
}