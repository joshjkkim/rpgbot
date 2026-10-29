import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

/** True when the signed-in Discord user is one of havocish's own admins (ADMIN_USER_IDS, comma-separated). */
export async function isAdmin(): Promise<boolean> {
    const session = await getServerSession(authOptions);
    const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return !!session?.userId && !session.error && ids.includes(session.userId);
}
