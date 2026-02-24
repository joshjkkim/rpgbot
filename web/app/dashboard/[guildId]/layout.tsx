import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import Sidebar from "@/app/components/sidebar/sidebar";

export default async function GuildLayout({ children, params }: { children: React.ReactNode; params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/");
    }

    return (
        <div className="min-h-screen grid grid-cols-[260px_1fr] bg-gradient-to-r from-gray-800 via-black to-gray-900">
            <Sidebar guildId={guildId} />
            <main className="p-6">{children}</main>
        </div>
    );
}