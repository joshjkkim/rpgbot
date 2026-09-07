import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { requireGuildOwner } from "@/app/lib/discord";
import { dbQuery } from "@/app/lib/db";
import Sidebar from "@/app/components/sidebar/sidebar";

export default async function GuildLayout({ children, params }: { children: React.ReactNode; params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/");
    }

    // The config API enforces this too, but without it here the sidebar would
    // label the server for someone who cannot read anything inside it.
    const auth = await requireGuildOwner(guildId);
    if (!auth.ok) {
        redirect("/dashboard");
    }

    const res = await dbQuery<{ name: string | null; icon_url: string | null }>(
        `SELECT name, icon_url FROM guilds WHERE discord_guild_id = $1`,
        [guildId]
    );
    const guild = res.rows[0] ?? null;

    return (
        <div className="min-h-screen grid grid-cols-[240px_1fr] bg-[var(--background)]">
            <Sidebar
                guildId={guildId}
                guildName={guild?.name ?? null}
                guildIconUrl={guild?.icon_url ?? null}
            />
            <main className="p-8">{children}</main>
        </div>
    );
}
