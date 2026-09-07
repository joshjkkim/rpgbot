import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import Dashboard from "../components/dashboard";
import { authOptions } from "../api/auth/[...nextauth]/auth";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);
    if (!session) {
        redirect("/");
    }

    return (
        <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
            <h1 className="text-2xl font-semibold tracking-tight">Your servers</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
                Signed in as {session.user?.name}. Pick a server to configure, or add Hermes
                to one that does not have it yet.
            </p>

            <Dashboard />
        </main>
    )
}