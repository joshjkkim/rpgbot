import { upsertUser, type DbUser } from "../db/users.js";
import { userIdCache, isStale, type CachedUserId } from "./caches.js";

const USER_CACHE_TTL_MS = 10 * 60 * 1000;

export async function getOrCreateDbUser(opts: { discordUserId: string; username?: string; avatarUrl?: string | null; }): Promise<CachedUserId> {
    const cached = userIdCache.get(opts.discordUserId);
    const now = Date.now();

    if (cached && !isStale(cached.lastRefreshed, USER_CACHE_TTL_MS)) {
        console.log(`Cache hit for user ${opts.discordUserId}`);
        const toReturn: CachedUserId = {
            user: cached.user,
            lastRefreshed: cached.lastRefreshed,
        };
        return toReturn;
    }

    const dbUser = await upsertUser({
        discordUserId: opts.discordUserId,

    });

    userIdCache.set(opts.discordUserId, {
        user: dbUser,
        lastRefreshed: now,
    });

    return { user: dbUser, lastRefreshed: now };
}

