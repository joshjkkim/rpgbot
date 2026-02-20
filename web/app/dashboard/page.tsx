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
        <main className="p-4"> 
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p>Welcome, {session.user?.name}!</p>

            <Dashboard />

        </main>
    )
}