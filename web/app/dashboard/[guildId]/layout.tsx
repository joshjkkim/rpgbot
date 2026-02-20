import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

const tabs = [
    { href: "", label: "Overview" },
    { href: "styles", label: "Style" },
    { href: "xp", label: "XP" },
    { href: "shop", label: "Shop" },
    { href: "achievements", label: "Achievements" },
    { href: "levels", label: "Levels" },
    { href: "logging", label: "Logging" },
]

export default async function GuildLayout({ children, params}: { children: React.ReactNode; params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/");
    }

    return (
        <div className="min-h-screen grid grid-cols-[260px_1fr] bg-gradient-to-r from-gray-800 via-black to-gray-900">
            <aside className="border-r bg-gradient-to-br from-black via-black to-blue-900 p-4">
                <div className="mb-4">
                <div className="text-xs text-zinc-500">Guild</div>
                <div className="font-semibold break-all">{guildId}</div>
                </div>

                <nav className="space-y-1">
                {tabs.map((t) => (
                    <Link
                    key={t.label}
                    href={`/dashboard/${guildId}/${t.href}`}
                    className="block rounded px-3 py-2 text-sm shadow-lg transition-all duration-250 ease-out border-transparent hover:bg-blue-800 border-2 hover:border-blue-500 hover:scale-105"
                    >
                    {t.label}
                    </Link>
                ))}
                </nav>
            </aside>

            <main className="p-6">{children}</main>
        </div>
    );
}